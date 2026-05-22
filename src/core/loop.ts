import { IProvider, Message, Tool, ToolResult, LoopConfig } from './types.js';
import { ToolRegistry } from '../tools/registry.js';
import { PermissionManager } from '../permissions/manager.js';

export interface AgentLoopConfig extends LoopConfig {
  permissionManager?: PermissionManager;
}

export class AgentLoop {
  private provider: IProvider;
  private registry: ToolRegistry;
  private maxIterations: number;
  private permissionManager: PermissionManager;

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider;
    this.maxIterations = config.maxIterations || 25;
    this.permissionManager = config.permissionManager || new PermissionManager();
    this.registry = new ToolRegistry();
    for (const tool of config.tools) {
      this.registry.register(tool);
    }
  }

  async run(userInput: string): Promise<string> {
    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are karen-cli, a helpful coding assistant. Use tools when needed.',
      },
      { role: 'user', content: userInput },
    ];

    for (let i = 0; i < this.maxIterations; i++) {
      const response = await this.provider.chat(messages, this.registry.definitions());

      if (response.content && !response.tool_calls) {
        return response.content;
      }

      if (response.tool_calls) {
        const toolResults: Message[] = [];

        for (const tc of response.tool_calls) {
          const tool = this.registry.get(tc.name);
          let result: ToolResult;

          if (!tool) {
            result = { success: false, output: '', error: `Tool ${tc.name} not found` };
          } else {
            const allowed = await this.permissionManager.check(tc.name, tc.arguments);
            if (!allowed) {
              result = { success: false, output: '', error: `Permission denied for ${tc.name}` };
            } else {
              result = await tool.execute(tc.arguments);
            }
          }

          toolResults.push({
            role: 'tool',
            content: result.success ? result.output : `Error: ${result.error}`,
            tool_call_id: tc.id,
          });
        }

        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: response.tool_calls,
        });

        messages.push(...toolResults);
      }
    }

    return 'Error: Reached maximum iteration limit';
  }
}
