import { Tool, ToolResult, IProvider } from '../core/types.js';
import { AgentLoop } from '../core/loop.js';
import { StormBreaker } from '../core/storm.js';
import { MemoryManager } from '../memory/manager.js';
import { TaskManager } from '../tasks/manager.js';
import { TranscriptLogger } from '../transcript/logger.js';

interface SubAgentDef {
  name: string;
  systemPrompt: string;
  description: string;
}

const SUB_AGENTS: Record<string, SubAgentDef> = {
  review: {
    name: 'review',
    systemPrompt: 'You are a code reviewer. Review the provided code changes for correctness, security, missing tests, and hidden behavior changes. Be thorough and cite specific lines. Return a structured review with severity tags (high/med/low).',
    description: 'Review code changes for correctness, security, and missing tests. Returns structured findings with severity.',
  },
  explore: {
    name: 'explore',
    systemPrompt: 'You are a codebase explorer. Survey the codebase broadly — read multiple files, trace call chains, find all callers of a function. Return a concise summary with file:line citations.',
    description: 'Broad read-only codebase investigation. Returns a distilled summary with file:line citations.',
  },
  research: {
    name: 'research',
    systemPrompt: 'You are a researcher. Combine web search and code reading to answer questions. Search for external references, then verify against the local codebase. Return a synthesis with both URL citations and file:line references.',
    description: 'Combine web search with code reading. Returns synthesis with external references and local code citations.',
  },
};

export interface SubAgentToolOptions {
  memoryManager?: MemoryManager;
  taskManager?: TaskManager;
  transcriptLogger?: TranscriptLogger;
}

export function createSubAgentTool(provider: IProvider, tools: Tool[], options: SubAgentToolOptions = {}): Tool {
  return {
    name: 'sub_agent',
    description: 'Spawn a specialized sub-agent for focused tasks:\n- review: code review with severity tags\n- explore: broad codebase survey with citations\n- research: web search + code reading synthesis',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['review', 'explore', 'research'], description: 'Which sub-agent to spawn.' },
        task: { type: 'string', description: 'Single task description. Use this OR tasks for parallel execution.' },
        tasks: { type: 'array', items: { type: 'string' }, description: 'Multiple tasks to run in PARALLEL sub-agents. Use for 2+ independent investigations.' },
      },
      required: ['type'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const agentType = String(args.type || '');
      const singleTask = args.task ? String(args.task) : '';
      const taskList: string[] = Array.isArray(args.tasks) && args.tasks.length > 0
        ? args.tasks.map(String)
        : singleTask ? [singleTask] : [];

      if (taskList.length === 0) return { success: false, output: '', error: 'Missing task or tasks argument.' };

      const def = SUB_AGENTS[agentType];
      if (!def) return { success: false, output: '', error: `Unknown sub-agent type. Use: review, explore, research.` };

      const runOne = async (task: string): Promise<string> => {
        const loop = new AgentLoop({
          provider,
          tools,
          maxIterations: 10,
          stormBreaker: new StormBreaker({ requestTimeoutMs: 60_000, maxRetries: 2 }),
          memoryManager: options.memoryManager,
          taskManager: options.taskManager,
          transcriptLogger: options.transcriptLogger,
          enableSchemaFlatten: true,
        });
        const input = `${def.systemPrompt}\n\n---\n\nTask:\n${task}\n\nReturn your findings directly. Do not ask questions.`;
        const { content } = await loop.run(input);
        return `## ${task.slice(0, 60)}\n${content}`;
      };

      try {
        // Run all tasks in parallel
        const results = await Promise.all(taskList.map(runOne));
        return { success: true, output: results.join('\n\n---\n\n') };
      } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
