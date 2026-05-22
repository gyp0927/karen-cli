import { Tool, ToolResult, IProvider } from '../core/types.js';
import { AgentLoop } from '../core/loop.js';

export function createAgentTool(provider: IProvider, tools: Tool[]): Tool {
  return {
    name: 'Agent',
    description: 'Delegate a sub-task to an agent. Provide a clear task description.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The sub-task to delegate to the agent',
        },
      },
      required: ['task'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const task = String(args.task);
        const loop = new AgentLoop({
          provider,
          tools,
          maxIterations: 5,
        });
        const output = await loop.run(task);
        return { success: true, output };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
