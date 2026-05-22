import { IProvider, Message, Tool, ToolResult, LoopConfig } from './types.js';
import { ToolRegistry } from '../tools/registry.js';
import { PermissionManager } from '../permissions/manager.js';

export interface AgentLoopConfig extends LoopConfig {
  permissionManager?: PermissionManager;
  onStream?: (chunk: string) => void;
  onToolUse?: (toolName: string, args: Record<string, unknown>) => void;
}

export class AgentLoop {
  private provider: IProvider;
  private registry: ToolRegistry;
  private maxIterations: number;
  private permissionManager: PermissionManager;
  private onStream?: (chunk: string) => void;
  private onToolUse?: (toolName: string, args: Record<string, unknown>) => void;

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider;
    this.maxIterations = config.maxIterations || 25;
    this.permissionManager = config.permissionManager || new PermissionManager();
    this.onStream = config.onStream;
    this.onToolUse = config.onToolUse;
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

  async run(userInput: string, onStream?: (chunk: string) => void): Promise<string> {
    const toolList = this.registry.list().map(t => `- ${t.name}: ${t.description}`).join('\n');

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are karen-cli, an AI coding assistant running inside a terminal. You have direct access to the user's file system and can execute commands.\n\nCRITICAL: When the user asks you to read, write, edit, search, or execute anything, you MUST use the available tools. Do NOT just describe what you would do - actually do it by calling the appropriate tool.\n\nAvailable tools:\n${toolList}\n\nRules:\n1. If user asks to create/modify/read a file → use the appropriate file tool immediately\n2. If user asks to run a command → use Bash tool immediately\n3. If user asks to search → use Grep or Glob tool immediately\n4. Always use tools to take action, never just describe the action`,
      },
      { role: 'user', content: userInput },
    ];

    for (let i = 0; i < this.maxIterations; i++) {
      const streamHandler = onStream || this.onStream;
      const hasStream = !!this.provider.streamChat && !!streamHandler;

      if (hasStream) {
        const stream = this.provider.streamChat!(messages, this.registry.definitions());
        let content = '';
        let toolCalls: import('../core/types.js').ToolCall[] | undefined;

        for await (const chunk of stream) {
          if (chunk.type === 'text' && chunk.content) {
            content += chunk.content;
            streamHandler!(chunk.content);
          } else if (chunk.type === 'tool_calls' && chunk.tool_calls) {
            toolCalls = chunk.tool_calls;
            break;
          }
        }

        if (!toolCalls) {
          return content;
        }

        // Handle tool calls after streaming
        const toolResults: Message[] = [];
        for (const tc of toolCalls) {
          this.onToolUse?.(tc.name, tc.arguments);
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
          content,
          tool_calls: toolCalls,
        });

        messages.push(...toolResults);
      } else {
        const response = await this.provider.chat(messages, this.registry.definitions());

        if (response.content && !response.tool_calls) {
          return response.content;
        }

        if (response.tool_calls) {
          const toolResults: Message[] = [];

          for (const tc of response.tool_calls) {
            this.onToolUse?.(tc.name, tc.arguments);
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
    }

    return 'Error: Reached maximum iteration limit';
  }
}
