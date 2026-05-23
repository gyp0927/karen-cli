import { Tool, ToolResult, IProvider } from '../core/types.js';
import { AgentLoop } from '../core/loop.js';
import { StormBreaker } from '../core/storm.js';
import { CostTracker } from '../core/cost.js';

export function createAgentTool(provider: IProvider, tools: Tool[]): Tool {
  return {
    name: 'Agent',
    description: 'Delegate a sub-task to an isolated agent. Provide a clear task description. The sub-agent runs with its own context and cannot pollute the parent conversation.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The sub-task to delegate to the agent',
        },
        context: {
          type: 'string',
          description: 'Optional additional context for the sub-agent',
        },
      },
      required: ['task'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const task = String(args.task);
        const context = args.context ? String(args.context) : '';

        // Subagent gets its own isolated loop with independent prefix cache,
        // its own storm breaker, and optionally a child cost tracker.
        const childCostTracker = new CostTracker();
        const loop = new AgentLoop({
          provider,
          tools,
          maxIterations: 5,
          stormBreaker: new StormBreaker({
            requestTimeoutMs: 60_000,
            maxRetries: 2,
          }),
          costTracker: childCostTracker,
          enableSchemaFlatten: true,
        });

        const input = context ? `${task}\n\nContext:\n${context}` : task;
        const { content } = await loop.run(input);

        const cost = childCostTracker.sessionCost();
        const output = cost > 0 ? `${content}\n\n[Sub-agent cost: $${cost.toFixed(4)}]` : content;

        return { success: true, output };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
