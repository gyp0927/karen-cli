import { BaseProvider } from './base.js';
import { Message, ProviderResponse, ToolDefinition, StreamChunk } from '../core/types.js';
import OpenAI from 'openai';

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  readonly model = 'gpt-4o';
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
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
      model: 'gpt-4o',
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
    const message = choice.message;

    return {
      content: message.content || undefined,
      tool_calls: message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      usage: response.usage ? {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      } : undefined,
    };
  }

  async *streamChat(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: this.formatMessages(messages),
      tools: tools?.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      stream: true,
      stream_options: { include_usage: true },
    });

    const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        const text = delta.content;
        if (text && text.length > 0) {
          yield { type: 'text', content: text };
        }
      }

      if (chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            prompt: chunk.usage.prompt_tokens,
            completion: chunk.usage.completion_tokens,
            total: chunk.usage.total_tokens,
          },
        };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index;
          if (!toolCallBuffers.has(index)) {
            toolCallBuffers.set(index, {
              id: tc.id || '',
              name: tc.function?.name || '',
              args: tc.function?.arguments || '',
            });
          } else {
            const existing = toolCallBuffers.get(index)!;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
          }
        }
      }

      if (chunk.choices[0]?.finish_reason === 'tool_calls') {
        const calls = Array.from(toolCallBuffers.values()).map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: JSON.parse(tc.args || '{}'),
        }));
        yield { type: 'tool_calls', tool_calls: calls };
      }
    }

    // Fallback: some providers emit tool call deltas but finish_reason is not 'tool_calls'
    if (toolCallBuffers.size > 0) {
      const calls = Array.from(toolCallBuffers.values()).map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: JSON.parse(tc.args || '{}'),
      }));
      yield { type: 'tool_calls', tool_calls: calls };
    }
  }
}
