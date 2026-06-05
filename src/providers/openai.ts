import { BaseProvider } from './base.js';
import { Message, ProviderResponse, ToolDefinition, StreamChunk } from '../core/types.js';
import OpenAI from 'openai';

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  model: string;
  private client: OpenAI;

  constructor(apiKey: string, model?: string) {
    super();
    this.model = model || 'gpt-4o';
    this.client = new OpenAI({ apiKey });
  }

  formatMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.tool_call_id || '',
        };
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: 'assistant',
          content: m.content,
          tool_calls: m.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      };
    });
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.formatMessages(messages),
      tools: tools?.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    if (!choice) {
      return { content: undefined, usage: undefined };
    }
    const message = choice.message;

    return {
      content: message.content || undefined,
      tool_calls: message.tool_calls?.map(tc => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* malformed JSON */ }
        return { id: tc.id, name: tc.function.name, arguments: args };
      }),
      usage: response.usage ? {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      } : undefined,
    };
  }

  async *streamChat(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk, void, unknown> {
    yield* this.streamChatOpenAICompatible(
      this.client,
      this.model,
      this.formatMessages(messages),
      tools
    );
  }
}
