import { BaseProvider } from './base.js';
import { Message, ProviderResponse, ToolDefinition, StreamChunk } from '../core/types.js';
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider extends BaseProvider {
  name = 'anthropic';
  model: string;
  private client: Anthropic;

  constructor(apiKey: string, model?: string) {
    super();
    this.model = model || 'claude-sonnet-4-6';
    this.client = new Anthropic({ apiKey });
  }

  formatMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{
            type: 'tool_result' as const,
            tool_use_id: m.tool_call_id || '',
            content: m.content,
          }],
        };
      }
      return {
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      };
    });
  }

  private extractSystem(messages: Message[]): { system?: string; rest: Message[] } {
    const systemParts: string[] = [];
    const rest: Message[] = [];
    for (const m of messages) {
      if (m.role === 'system') {
        systemParts.push(m.content);
      } else {
        rest.push(m);
      }
    }
    return {
      system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      rest,
    };
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse> {
    const { system, rest } = this.extractSystem(messages);
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: this.formatMessages(rest),
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

  async *streamChat(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk, void, unknown> {
    const { system, rest } = this.extractSystem(messages);
    const stream = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: this.formatMessages(rest),
      tools: tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      })),
      stream: true,
    });

    const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          const index = event.index;
          if (toolCallBuffers.has(index)) {
            toolCallBuffers.get(index)!.args += event.delta.partial_json;
          }
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolCallBuffers.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            args: JSON.stringify(event.content_block.input || {}),
          });
        } else if (event.content_block.type === 'text') {
          // Anthropic can emit text blocks before/alongside tool calls
          yield { type: 'text', content: event.content_block.text };
        }
      }
    }

    if (toolCallBuffers.size > 0) {
      const calls = Array.from(toolCallBuffers.values()).map(tc => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.args || '{}'); } catch { /* malformed */ }
        return { id: tc.id, name: tc.name, arguments: args };
      }).filter(tc => tc.id && tc.name);
      if (calls.length > 0) {
        yield { type: 'tool_calls', tool_calls: calls };
      }
    }
  }
}
