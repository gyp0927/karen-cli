import type { IProvider, Message, ToolDefinition, ProviderResponse, StreamChunk } from '../core/types.js';
import type OpenAI from 'openai';

export abstract class BaseProvider implements IProvider {
  abstract name: string;
  abstract model: string;
  abstract chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse>;

  /**
   * Shared streaming implementation for OpenAI-compatible APIs.
   * Both OpenAIProvider and SiliconFlowProvider delegate to this.
   */
  protected async *streamChatOpenAICompatible(
    client: OpenAI,
    model: string,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools?: ToolDefinition[]
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools: tools?.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
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

      if (chunk.choices[0]?.finish_reason) {
        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason === 'tool_calls') {
          const calls = Array.from(toolCallBuffers.values()).map(tc => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.args || '{}'); } catch { /* malformed */ }
            return { id: tc.id, name: tc.name, arguments: args };
          });
          yield { type: 'tool_calls', tool_calls: calls };
          toolCallBuffers.clear();
        }
      }
    }

    // Fallback: only emit remaining tool calls if the stream had tool call deltas.
    // This handles providers that don't send a finish_reason of 'tool_calls'.
    // Only emit if ALL buffered calls have both an id and a name (complete metadata).
    if (toolCallBuffers.size > 0) {
      const calls = Array.from(toolCallBuffers.values())
        .filter(tc => tc.id && tc.name)
        .map(tc => {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.args || '{}'); } catch { /* malformed */ }
          return { id: tc.id, name: tc.name, arguments: args };
        });
      if (calls.length > 0) {
        yield { type: 'tool_calls', tool_calls: calls };
      }
    }
  }
}
