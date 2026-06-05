import { BaseProvider } from './base.js';
import { Message, ProviderResponse, ToolDefinition, StreamChunk } from '../core/types.js';
import OpenAI from 'openai';

/**
 * DeepSeek native API provider.
 * Uses DeepSeek's own API (https://api.deepseek.com) instead of SiliconFlow proxy.
 * Model: deepseek-chat (V3) or deepseek-reasoner (R1).
 */
export class DeepSeekProvider extends BaseProvider {
  name = 'deepseek';
  private client: OpenAI;
  model: string;

  constructor(apiKey: string, model = 'deepseek-chat') {
    super();
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });
    this.model = model;
  }

  formatMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(m => {
      if (m.role === 'tool') {
        return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id || '' };
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: 'assistant',
          content: m.content,
          tool_calls: m.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return { role: m.role as 'user' | 'assistant' | 'system', content: m.content };
    });
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.formatMessages(messages),
      tools: tools?.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
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
        try { args = JSON.parse(tc.function.arguments); } catch { /* malformed */ }
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
    yield* this.streamChatOpenAICompatible(this.client, this.model, this.formatMessages(messages), tools);
  }
}
