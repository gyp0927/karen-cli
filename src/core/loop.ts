import { IProvider, Message, Tool, ToolResult, LoopConfig, TokenUsage } from './types.js';
import { ToolRegistry } from '../tools/registry.js';
import { PermissionManager } from '../permissions/manager.js';
import { Skill } from '../skills/types.js';
import { MemoryManager } from '../memory/manager.js';
import { TaskManager } from '../tasks/manager.js';
import { HookManager } from '../hooks/manager.js';
import { ContextCompactor } from './compaction.js';
import { PrefixCache } from './prefix-cache.js';
import { ToolCallRepair } from './repair.js';
import { StormBreaker } from './storm.js';
import { CostTracker, BudgetConfig } from './cost.js';
import { LocalTokenizer } from './tokenizer.js';
import { flattenToolSchema } from './schema-flatten.js';
import { Logger } from '../utils/logger.js';
import { PlanManager } from '../plan/manager.js';
import { RepeatGuard } from './repeat-guard.js';
import { TranscriptLogger } from '../transcript/logger.js';
import { getConfigDir } from '../utils/paths.js';
import { buildSystemPrompt } from './prompt.js';
import { KarenMode, MODES, MODE_ORDER } from './modes.js';
import { validateResult } from '../tools/validate.js';
import { LIMITS, TIMEOUTS, DEFAULTS } from './constants.js';

/** Wrap an async generator with a per-chunk read timeout. */
async function* withStreamTimeout<T>(
  generator: AsyncGenerator<T>,
  timeoutMs: number,
  label: string
): AsyncGenerator<T> {
  while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      generator.next().finally(() => { if (timer) clearTimeout(timer); }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} stream stalled: no data for ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    if (result.done) return result.value;
    yield result.value;
  }
}

export interface AgentLoopConfig extends LoopConfig {
  permissionManager?: PermissionManager;
  onStream?: (chunk: string) => void;
  onToolUse?: (toolName: string, args: Record<string, unknown>) => void;
  onToolStart?: (toolName: string, args: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, args: Record<string, unknown>, success: boolean) => void;
  onNeedPermission?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  skills?: Skill[];
  cwd?: string;
  memoryManager?: MemoryManager;
  taskManager?: TaskManager;
  hookManager?: HookManager;
  compactor?: ContextCompactor;
  costTracker?: CostTracker;
  stormBreaker?: StormBreaker;
  budget?: BudgetConfig;
  enableSchemaFlatten?: boolean;
  planManager?: PlanManager;
  repeatGuard?: RepeatGuard;
  transcriptLogger?: TranscriptLogger;
  mode?: KarenMode;
}

export class AgentLoop {
  private provider: IProvider;
  private registry: ToolRegistry;
  private maxIterations: number;
  private permissionManager: PermissionManager;
  private onStream?: (chunk: string) => void;
  onToolUse?: (toolName: string, args: Record<string, unknown>) => void;
  onToolStart?: (toolName: string, args: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, args: Record<string, unknown>, success: boolean) => void;
  onNeedPermission?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  private skills: Skill[];
  private cwd: string;
  private memoryManager?: MemoryManager;
  private taskManager?: TaskManager;
  private hookManager?: HookManager;
  private compactor?: ContextCompactor;
  private costTracker?: CostTracker;
  private stormBreaker: StormBreaker;
  private tokenizer: LocalTokenizer;
  private prefixCache: PrefixCache;
  private repair: ToolCallRepair;
  private enableSchemaFlatten: boolean;
  private runCounter = 0;
  private planManager?: PlanManager;
  private repeatGuard?: RepeatGuard;
  private transcriptLogger?: TranscriptLogger;
  private mode: KarenMode = 'code';

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider;
    this.maxIterations = config.maxIterations || DEFAULTS.MAX_ITERATIONS;
    this.permissionManager = config.permissionManager || new PermissionManager();
    this.onStream = config.onStream;
    this.onToolUse = config.onToolUse;
    this.onToolStart = config.onToolStart;
    this.onToolEnd = config.onToolEnd;
    this.onNeedPermission = config.onNeedPermission;
    this.skills = config.skills || [];
    this.cwd = config.cwd || process.cwd();
    this.memoryManager = config.memoryManager;
    this.taskManager = config.taskManager;
    this.hookManager = config.hookManager;
    this.compactor = config.compactor;
    this.costTracker = config.costTracker;
    this.stormBreaker = config.stormBreaker || new StormBreaker();
    this.tokenizer = new LocalTokenizer();
    this.prefixCache = new PrefixCache();
    this.repair = new ToolCallRepair();
    this.enableSchemaFlatten = config.enableSchemaFlatten ?? true;
    this.planManager = config.planManager;
    this.repeatGuard = config.repeatGuard;
    this.transcriptLogger = config.transcriptLogger;
    this.mode = config.mode || 'code';
    this.registry = new ToolRegistry();
    for (const tool of config.tools) {
      this.registry.register(tool);
    }
  }

  getProviderInfo(): { name: string; model: string } {
    return { name: this.provider.name, model: this.provider.model };
  }

  getTools(): Tool[] {
    return this.registry.list();
  }

  addTool(tool: Tool): void {
    this.registry.register(tool);
    this.updateToolListCache();
  }

  private cachedToolList: string | null = null;

  private updateToolListCache(): void {
    this.cachedToolList = this.registry.list().map(t => {
      // Truncate descriptions to first sentence for speed
      const desc = t.description.split('.')[0] + '.';
      return `- ${t.name}: ${desc}`;
    }).join('\n');
  }

  getSkills(): Skill[] {
    return this.skills;
  }

  setSkills(skills: Skill[]): void {
    this.skills = skills;
  }

  setProvider(provider: IProvider): void {
    this.provider = provider;
  }

  getTaskManager(): TaskManager | undefined {
    return this.taskManager;
  }

  getMemoryManager(): MemoryManager | undefined {
    return this.memoryManager;
  }

  getCostTracker(): CostTracker | undefined {
    return this.costTracker;
  }

  getMode(): KarenMode {
    return this.mode;
  }

  setMode(mode: KarenMode): void {
    this.mode = mode;
  }

  nextMode(): KarenMode {
    const idx = MODE_ORDER.indexOf(this.mode);
    this.mode = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
    return this.mode;
  }

  private getToolDefinitions() {
    const defs = this.registry.definitions();
    if (this.enableSchemaFlatten) {
      return defs.map(flattenToolSchema);
    }
    return defs;
  }

  /**
   * Execute one turn of the agent loop.
   * @param userInput — the user's message
   * @param onStream — optional callback for real-time streaming output
   * @param history — previous conversation messages (for /resume)
   * @returns final text content, full message list, and token usage
   */
  async run(
    userInput: string,
    onStream?: (chunk: string) => void,
    history?: Message[]
  ): Promise<{ content: string; messages: Message[]; usage?: TokenUsage }> {
    this.runCounter++;
    this.transcriptLogger?.startTurn();
    this.transcriptLogger?.logUser(userInput);

    // Periodic cleanup of expired memories (every 10 runs)
    if (this.memoryManager && this.runCounter % 10 === 0) {
      this.memoryManager.cleanup().catch((err) => {
        Logger.warn(`Memory cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    if (!this.cachedToolList) {
      this.updateToolListCache();
    }
    const toolList = this.cachedToolList || '';

    // Match skills by trigger keywords (uses pre-computed lowercase triggers)
    const lowerInput = userInput.toLowerCase();
    const matchedSkills = this.skills.filter(skill => {
      const triggers = skill._lowerTriggers || skill.trigger.map(t => t.toLowerCase());
      return triggers.some(t => lowerInput.includes(t));
    });

    let skillPrompts = '';
    if (matchedSkills.length > 0) {
      skillPrompts = '\n\n--- Active Skills ---\n' + matchedSkills.map(s =>
        `## ${s.name}\n${s.description}\n\n${s.prompt}`
      ).join('\n\n');
    }

    const modePrompt = MODES[this.mode].behaviorPrompt;
    const systemContent = await buildSystemPrompt({
      cwd: this.cwd,
      toolList,
      skillPrompts,
      memoryManager: this.memoryManager,
      provider: this.provider.name,
    });
    // Inject mode behavior at the start of the prompt
    const fullSystemContent = `[MODE: ${MODES[this.mode].emoji} ${MODES[this.mode].name}]\n${modePrompt}\n\n${systemContent}`;

    let messages: Message[] = [
      { role: 'system', content: fullSystemContent },
      ...(history || []),
      { role: 'user', content: userInput },
    ];

    // Token budget gate
    const tokenEst = this.tokenizer.estimateMessages(messages);
    if (tokenEst.tokens > LIMITS.MAX_TOKEN_BUDGET) {
      Logger.warn(`Estimated token count ${tokenEst.tokens} exceeds budget ${LIMITS.MAX_TOKEN_BUDGET}. Compacting...`);
      if (this.compactor) {
        const compacted = this.compactor.compact(messages);
        messages = compacted.messages;
      }
    }

    // Prefix cache: split system from dynamic messages for provider-level optimization
    this.prefixCache.build(messages, fullSystemContent, this.getToolDefinitions());

    // Trigger pre-run hooks
    if (this.hookManager) {
      await this.hookManager.trigger('pre-loop', { input: userInput, cwd: this.cwd });
    }

    let totalUsage: TokenUsage | undefined;
    let totalIterations = 0;
    let batchIterations = 0;

    while (totalIterations < DEFAULTS.HARD_ITERATION_CAP) {
      // Compact context if needed
      if (this.compactor) {
        const compacted = this.compactor.compact(messages);
        if (compacted.dropped > 0) {
          messages = compacted.messages;
        }
      }

      totalIterations++;
      batchIterations++;

      // Inject task/plan progress every 5 iterations to keep model on track
      if (totalIterations > 1 && totalIterations % 5 === 0) {
        const progressBlock = this.buildProgressBlock();
        if (progressBlock) {
          messages.push({ role: 'system', content: progressBlock });
        }
      }

      const streamHandler = onStream || this.onStream;
      const hasStream = !!this.provider.streamChat && !!streamHandler;

      let responseContent = '';
      let responseToolCalls: import('./types.js').ToolCall[] | undefined;
      let responseUsage: TokenUsage | undefined;

      try {
        if (hasStream) {
          const rawStream = await this.stormBreaker.execute(
            'streamChat',
            () => Promise.resolve(this.provider.streamChat!(messages, this.getToolDefinitions()))
          );

          // Apply per-chunk read timeout to prevent infinite stalls
          const stream = withStreamTimeout(rawStream, TIMEOUTS.STREAM_CHUNK, 'streamChat');

          let content = '';
          let toolCalls: import('./types.js').ToolCall[] | undefined;

          for await (const chunk of stream) {
            if (chunk.type === 'text' && chunk.content) {
              content += chunk.content;
              streamHandler!(chunk.content);
            } else if (chunk.type === 'tool_calls' && chunk.tool_calls) {
              toolCalls = chunk.tool_calls;
              break;
            }
          }

          responseContent = content;
          responseToolCalls = toolCalls;
        } else {
          const response = await this.stormBreaker.execute(
            'chat',
            () => this.provider.chat(messages, this.getToolDefinitions())
          );

          responseContent = response.content || '';
          responseToolCalls = response.tool_calls;
          responseUsage = response.usage;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Logger.error(`Provider error: ${msg}`);
        this.transcriptLogger?.logError(msg);
        return { content: `Error: ${msg}`, messages, usage: totalUsage };
      }

      // Log assistant response to transcript
      this.transcriptLogger?.logAssistant(responseContent, responseToolCalls, responseUsage);

      // Record cost
      if (responseUsage) {
        totalUsage = this.mergeUsage(totalUsage, responseUsage);
        this.costTracker?.record(this.provider.name, this.provider.model, responseUsage);
      }

      // Repair malformed tool calls
      if (responseToolCalls && responseToolCalls.length > 0) {
        const repairResult = this.repair.repair(responseToolCalls as unknown[]);
        if (repairResult.wasRepaired) {
          Logger.info(`ToolCallRepair: fixed ${responseToolCalls.length - repairResult.repaired.length} broken calls`);
        }
        if (repairResult.error) {
          Logger.error(`ToolCallRepair failed: ${repairResult.error}`);
        }
        responseToolCalls = repairResult.repaired;
      }

      // Repeat guard: detect looping on identical tool calls
      const guardResult = this.repeatGuard?.check(responseToolCalls || []);
      if (guardResult?.forceExit) {
        const warning = guardResult.warning || '[repeat-loop guard] Repeated identical tool calls detected. Stopping loop.';
        this.transcriptLogger?.logError(warning);
        return { content: warning, messages, usage: totalUsage };
      }
      if (guardResult?.isRepeat && guardResult.warning) {
        // Stop wasting API calls on repeats; return the warning directly.
        this.transcriptLogger?.logError(guardResult.warning);
        return { content: guardResult.warning, messages, usage: totalUsage };
      }

      if (!responseToolCalls || responseToolCalls.length === 0) {
        // Trim trailing/leading whitespace but preserve internal blank lines for markdown formatting.
        const cleanedContent = responseContent.trim();
        await this.saveMemory(userInput, cleanedContent);
        await this.saveSession(messages);
        if (this.hookManager) {
          await this.hookManager.trigger('post-loop', { input: userInput, output: cleanedContent, cwd: this.cwd });
        }
        return { content: cleanedContent, messages, usage: totalUsage };
      }

      // Handle tool calls — execute independent calls in parallel
      const toolResults: Message[] = [];
      const executeOne = async (tc: import('./types.js').ToolCall): Promise<Message> => {
        this.onToolUse?.(tc.name, tc.arguments);
        this.onToolStart?.(tc.name, tc.arguments);
        this.transcriptLogger?.logToolCall(tc.name, tc.arguments);
        const tool = this.registry.get(tc.name);
        let result: ToolResult;

        if (!tool) {
          result = { success: false, output: '', error: `Tool ${tc.name} not found` };
        } else {
          const allowed = this.onNeedPermission
            ? await this.onNeedPermission(tc.name, tc.arguments)
            : await this.permissionManager.check(tc.name, tc.arguments);
          if (!allowed) {
            result = { success: false, output: '', error: `User denied permission for ${tc.name}` };
          } else {
            result = validateResult(await tool.execute(tc.arguments));
          }
        }

        this.onToolEnd?.(tc.name, tc.arguments, result.success);
        this.transcriptLogger?.logToolResult(tc.name, result.success ? result.output : '', result.success ? undefined : result.error);
        return {
          role: 'tool' as const,
          content: result.success ? result.output : `Error: ${result.error}`,
          tool_call_id: tc.id,
        };
      };

      // Execute all tool calls from this response in parallel
      const settled = await Promise.allSettled(responseToolCalls.map(executeOne));
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        const tcId = responseToolCalls[i]?.id || `error-${i}`;
        if (s.status === 'fulfilled') {
          toolResults.push(s.value);
        } else {
          toolResults.push({
            role: 'tool',
            content: `Error: Tool execution failed: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`,
            tool_call_id: tcId,
          });
        }
      }

      messages.push({
        role: 'assistant',
        content: responseContent,
        tool_calls: responseToolCalls,
      });

      messages.push(...toolResults);

      // Batch exhausted — if using default maxIterations, inject continuation and keep going.
      // If caller explicitly set a lower limit, respect it as a hard cap.
      if (batchIterations >= this.maxIterations && this.maxIterations > DEFAULTS.MAX_ITERATIONS && totalIterations < DEFAULTS.HARD_ITERATION_CAP) {
        batchIterations = 0;
        const progress = this.buildProgressBlock();
        messages.push({
          role: 'system',
          content: `[Batch limit reached after ${totalIterations} iterations. You are NOT done — continue the task.]\n${progress || ''}\nPick up exactly where you left off.`,
        });
      } else if (batchIterations >= this.maxIterations) {
        break; // Hard cap — caller's explicit limit
      }
    }

    // Hard cap reached — return a useful summary
    const finalContent = this.buildFinalSummary(messages);
    return { content: finalContent, messages, usage: totalUsage };
  }

  /** Build a progress block from active Task/Plan state. */
  private buildProgressBlock(): string | null {
    const parts: string[] = [];

    if (this.planManager?.hasPlan) {
      const status = this.planManager.getStatus();
      parts.push(`[Plan: ${status.completedSteps}/${status.totalSteps} steps completed]`);
      if (status.currentStep) {
        parts.push(`Current step: ${status.currentStep.title}`);
      }
    }

    if (this.taskManager) {
      const summary = this.taskManager.getSummary();
      if (summary.total > 0) {
        parts.push(`[Tasks: ${summary.completed}/${summary.total} done, ${summary.running} running, ${summary.pending} pending]`);
      }
    }

    if (this.costTracker) {
      const cost = this.costTracker.sessionCost();
      const tokens = this.costTracker.totalTokens();
      if (tokens.total > 0) {
        parts.push(`[Session: ${tokens.total} tokens, $${cost.toFixed(4)}]`);
      }
    }

    return parts.length > 0 ? parts.join(' | ') + '\nContinue with the next step. Do NOT re-do completed work.' : null;
  }

  /** Build a final summary when the iteration cap is reached. */
  private buildFinalSummary(messages: Message[]): string {
    const parts: string[] = ['[Maximum iterations reached. Here is a summary of what was done:]'];

    if (this.planManager?.hasPlan) {
      const status = this.planManager.getStatus();
      parts.push(`Plan "${status.summary}": ${status.completedSteps}/${status.totalSteps} steps completed.`);
    }

    if (this.taskManager) {
      const summary = this.taskManager.getSummary();
      parts.push(`Tasks: ${summary.completed} completed, ${summary.failed} failed, ${summary.pending} remaining.`);
    }

    return parts.join('\n');
  }

  private mergeUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage {
    if (!a) return b || { prompt: 0, completion: 0, total: 0 };
    if (!b) return a;
    return {
      prompt: a.prompt + b.prompt,
      completion: a.completion + b.completion,
      total: a.total + b.total,
    };
  }

  private async saveMemory(input: string, output: string): Promise<void> {
    if (!this.memoryManager) return;
    try {
      await this.memoryManager.save({
        type: 'project',
        content: `User: ${input}\nAssistant: ${output}`,
        tags: ['conversation', this.cwd],
      });
    } catch { /* ignore */ }
  }

  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionSaveInProgress = false;

  /** Cancel pending session save (call on shutdown). */
  cancelPendingSaves(): void {
    if (this.sessionSaveTimer) {
      clearTimeout(this.sessionSaveTimer);
      this.sessionSaveTimer = null;
    }
  }

  private async saveSession(messages: Message[]): Promise<void> {
    if (this.sessionSaveInProgress) return;
    this.sessionSaveInProgress = true;
    try {
      // Throttle: debounce to avoid excessive writes, always save latest state
      if (this.sessionSaveTimer) {
        clearTimeout(this.sessionSaveTimer);
      }
      const timer = setTimeout(async () => {
        if (this.sessionSaveTimer !== timer) return; // A newer timer was set
        this.sessionSaveTimer = null;
        try {
          const { writeFileSync, mkdirSync, existsSync } = await import('fs');
          const { join } = await import('path');
          const dir = getConfigDir();
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          const history = messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-50);
          writeFileSync(join(dir, 'session.json'), JSON.stringify({ updatedAt: Date.now(), cwd: this.cwd, history }, null, 2), 'utf8');
        } catch (err) {
          Logger.debug(`Session save failed: ${err instanceof Error ? err.message : String(err)}`, 'loop');
        }
      }, 2000);
      this.sessionSaveTimer = timer;
    } finally {
      this.sessionSaveInProgress = false;
    }
  }

  /** Load previous session history (for /resume). */
  async loadSession(): Promise<Message[]> {
    try {
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const path = join(getConfigDir(), 'session.json');
      if (!existsSync(path)) return [];
      const data = JSON.parse(readFileSync(path, 'utf8'));
      return Array.isArray(data.history) ? data.history : [];
    } catch {
      return [];
    }
  }
}
