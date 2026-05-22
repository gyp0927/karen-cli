import { BaseProvider } from './base.js';
import { Message, ProviderResponse, ToolDefinition } from '../core/types.js';
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider extends BaseProvider {
  name = 'anthropic';
  readonly model = 'claude-sonnet-4-6';
  private client: Anthropic;

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  formatMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: this.formatMessages(messages),
      tools: tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      })),
    });

    const toolCalls = response.content
      .filter(c => c.type === 'tool_use')
      .map(c => ({
        id: c.id,
        name: c.name,
        arguments: c.input as Record<string, unknown>,
      }));

    const textContent = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      content: textContent || undefined,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage ? {
        prompt: response.usage.input_tokens,
        completion: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      } : undefined,
    };
  }
}
