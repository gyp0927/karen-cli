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

/** Wrap an async generator with a per-chunk read timeout. */
async function* withStreamTimeout<T>(
  generator: AsyncGenerator<T>,
  timeoutMs: number,
  label: string
): AsyncGenerator<T> {
  while (true) {
    const result = await Promise.race([
      generator.next(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} stream stalled: no data for ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    if (result.done) return result.value;
    yield result.value;
  }
}

export interface AgentLoopConfig extends LoopConfig {
  permissionManager?: PermissionManager;
  onStream?: (chunk: string) => void;
  onToolUse?: (toolName: string, args: Record<string, unknown>) => void;
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
}

export class AgentLoop {
  private provider: IProvider;
  private registry: ToolRegistry;
  private maxIterations: number;
  private permissionManager: PermissionManager;
  private onStream?: (chunk: string) => void;
  private onToolUse?: (toolName: string, args: Record<string, unknown>) => void;
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
  private currentPrefixHash?: string;
  private runCounter = 0;
  private planManager?: PlanManager;
  private repeatGuard?: RepeatGuard;
  private transcriptLogger?: TranscriptLogger;

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider;
    this.maxIterations = config.maxIterations || 10;
    this.permissionManager = config.permissionManager || new PermissionManager();
    this.onStream = config.onStream;
    this.onToolUse = config.onToolUse;
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

  private async buildSystemPrompt(toolList: string, skillPrompts: string): Promise<string> {
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    let memoryContext = '';
    if (this.memoryManager) {
      try {
        // Four-layer memory: project > global > user > skill
        const projectMemories = await this.memoryManager.load({ type: 'project', keywords: [this.cwd] });
        const globalMemories = await this.memoryManager.load({ type: 'global' });
        const userMemories = await this.memoryManager.load({ type: 'user' });
        const skillMemories = await this.memoryManager.load({ type: 'skill' });

        const allMemories = [
          ...projectMemories.slice(0, 5),
          ...globalMemories.slice(0, 3),
          ...userMemories.slice(0, 2),
          ...skillMemories.slice(0, 2),
        ];

        if (allMemories.length > 0) {
          memoryContext = '\n\n--- Project Memory ---\n' + allMemories.map(m => m.summary || m.content).join('\n');
        }
      } catch { /* ignore */ }
    }

    return `You are karen-cli, an AI coding assistant running inside a terminal. You have direct access to the user's file system and can execute commands.\n\n=== TODAY'S ACTUAL DATE AND TIME: ${dateStr} ${timeStr} ===\nTHIS IS THE ONLY DATE YOU KNOW. You MUST use this exact date in all responses.\nYou DO NOT know what year, month, or day it is other than what is written above.\nIf you mention any date in your answer, it MUST be ${dateStr}.\nCurrent working directory: ${this.cwd}\n\nCRITICAL: When the user asks you to read, write, edit, search, or execute anything, you MUST use the available tools. Do NOT just describe what you would do - actually do it by calling the appropriate tool.\n\nAvailable tools:\n${toolList}\n\nRules:\n1. If user asks to create/modify/read a file → use the appropriate file tool immediately\n2. If user asks to run a command → use Bash tool immediately\n3. If user asks to search local files → use Grep or Glob tool immediately\n4. If user asks about git status/history/branches/changes → use Git tool immediately\n5. If user asks to install/remove/list skills → use the Skill tool immediately\n6. If user asks for weather or forecast → you MUST call the Weather tool immediately with the city name. Do NOT use WebSearch for weather queries.
7. If user asks for general web information, current news, or online docs → you MUST call the WebSearch or WebFetch tool immediately.\n7. If user asks to undo a change or revert an edit → use Undo tool immediately\n8. If user asks about project structure or to find files by pattern → use Index tool with path='${this.cwd}' immediately\n9. If user asks to connect to external services (browser, DB, Slack) → use MCP tool immediately\n10. If user asks for complex multi-step work → use Task tool to create and track tasks, then execute them step by step\n11. If user asks to delegate a sub-task to another agent → use Agent tool immediately\n12. If user asks to review / audit / analyze / check / 审查 / 检查 / 看一下 / 分析一下 code or project WITHOUT specifying a path → immediately use Index tool on the current directory to scan project structure, then read relevant files. Do NOT ask the user for a path.\n13. If the user asks about "your project" or "this project" without specifying a path, they mean the project at the current working directory (${this.cwd})\n14. If user asks "这个项目是干嘛的" / "这是什么项目" / "介绍一下这个项目" → immediately use Read tool on README.md and package.json in ${this.cwd}, then summarize. Do NOT ask for a path.\n15. If user says "你自己去查" / "你自己去看" / "你自己找" → immediately use the most appropriate tool to find the answer. Do NOT ask the user for more information.\n16. Be EFFICIENT with tool calls: scan project structure once with Index, then read multiple files in parallel if possible. Avoid calling the same tool repeatedly for the same information.\n17. Always use tools to take action, never just describe the action
18. You HAVE a memory system. The system automatically loads relevant memories into your context before each response. User preferences saved via /remember are permanent. Project memories expire after 30 days. When the user asks if you have memory, say YES and explain the memory layers (project, global, user, skill)
19. If a task requires 3+ steps, risky changes, or parallel work → use Plan tool to submit a structured plan BEFORE acting. Wait for user approval before executing approved steps.
20. If user asks to start a dev server, watcher, build, or any long-running command → use BackgroundJob tool with operation=spawn. Do NOT use Bash for long-running or indefinite processes.

MANDATORY BEHAVIOR — VIOLATING THESE IS A BUG:
- You are FORBIDDEN from saying phrases like "我来...", "让我...", "首先...", "现在...", "接下来...", "等一下...", "先看看..." or ANY preamble before a tool call.
- If you output ANY text before calling a tool, that is WRONG. Call the tool FIRST with ZERO text beforehand.
- When the user asks a question, your FIRST token must either be a tool call or the start of the final answer. NEVER output planning text.
- You do NOT need to ask permission or confirm before calling a tool. Just call it.

CRITICAL RULES for tool use:
- When you receive tool results, you MUST immediately synthesize them into a final answer for the user. Do NOT call the same tool again for the same request.
- If a tool returns an error or empty result, do NOT retry with the same tool. Tell the user the lookup failed and ask if they want to try something else.
- If a web search returns results, read them carefully and answer the user directly. Do NOT say "let me search again" or "the data is outdated" — just present what you found.
- NEVER describe what you are going to do. Either call the tool immediately, or give the final answer immediately.
- ABSOLUTE MAXIMUM: you may only call WebSearch or WebFetch ONCE per user request. Multiple searches for the same query are strictly forbidden.

EXAMPLES of correct behavior:
- User: "今天沈阳的天气" → Assistant immediately calls Weather tool with {"city": "沈阳"}
- User: "Search Node.js fetch docs" → Assistant immediately calls WebSearch tool with {"query": "Node.js fetch API documentation"}
- User: "Show me project structure" → Assistant immediately calls Index tool with path="${this.cwd}"${skillPrompts}${memoryContext}`;
  }

  private getToolDefinitions() {
    const defs = this.registry.definitions();
    if (this.enableSchemaFlatten) {
      return defs.map(flattenToolSchema);
    }
    return defs;
  }

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
      this.memoryManager.cleanup().catch(() => {});
    }

    const toolList = this.registry.list().map(t => `- ${t.name}: ${t.description}`).join('\n');

    // Match skills by trigger keywords
    const lowerInput = userInput.toLowerCase();
    const matchedSkills = this.skills.filter(skill =>
      skill.trigger.some(t => lowerInput.includes(t.toLowerCase()))
    );

    let skillPrompts = '';
    if (matchedSkills.length > 0) {
      skillPrompts = '\n\n--- Active Skills ---\n' + matchedSkills.map(s =>
        `## ${s.name}\n${s.description}\n\n${s.prompt}`
      ).join('\n\n');
    }

    const systemContent = await this.buildSystemPrompt(toolList, skillPrompts);

    let messages: Message[] = [
      { role: 'system', content: systemContent },
      ...(history || []),
      { role: 'user', content: userInput },
    ];

    // Token budget gate
    const tokenEst = this.tokenizer.estimateMessages(messages);
    const MAX_BUDGET_TOKENS = 120_000; // reasonable ceiling
    if (tokenEst.tokens > MAX_BUDGET_TOKENS) {
      Logger.warn(`Estimated token count ${tokenEst.tokens} exceeds budget ${MAX_BUDGET_TOKENS}. Compacting...`);
      if (this.compactor) {
        const compacted = this.compactor.compact(messages);
        messages = compacted.messages;
      }
    }

    // Prefix cache: split system from dynamic messages
    const cached = this.prefixCache.build(messages, systemContent, this.getToolDefinitions());
    this.currentPrefixHash = cached.hash;

    // Trigger pre-run hooks
    if (this.hookManager) {
      await this.hookManager.trigger('pre-loop', { input: userInput, cwd: this.cwd });
    }

    let totalUsage: TokenUsage | undefined;

    for (let i = 0; i < this.maxIterations; i++) {
      // Compact context if needed
      if (this.compactor) {
        const compacted = this.compactor.compact(messages);
        if (compacted.dropped > 0) {
          messages = compacted.messages;
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
          const stream = withStreamTimeout(rawStream, 60_000, 'streamChat');

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
        const msg = (err as Error).message;
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
      const guardResult = this.repeatGuard?.check(responseToolCalls);
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
        if (this.hookManager) {
          await this.hookManager.trigger('post-loop', { input: userInput, output: cleanedContent, cwd: this.cwd });
        }
        return { content: cleanedContent, messages, usage: totalUsage };
      }

      // Handle tool calls
      const toolResults: Message[] = [];
      for (const tc of responseToolCalls) {
        this.onToolUse?.(tc.name, tc.arguments);
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
            result = await tool.execute(tc.arguments);
          }
        }

        this.transcriptLogger?.logToolResult(tc.name, result.success ? result.output : '', result.success ? undefined : result.error);
        toolResults.push({
          role: 'tool',
          content: result.success ? result.output : `Error: ${result.error}`,
          tool_call_id: tc.id,
        });
      }

      messages.push({
        role: 'assistant',
        content: responseContent,
        tool_calls: responseToolCalls,
      });

      messages.push(...toolResults);
    }

    return { content: 'Error: Reached maximum iteration limit', messages, usage: totalUsage };
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
}
