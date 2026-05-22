import { BaseProvider } from './base.js';
import { Message, ProviderResponse, ToolDefinition } from '../core/types.js';
import OpenAI from 'openai';

export class SiliconFlowProvider extends BaseProvider {
  name = 'siliconflow';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'deepseek-ai/DeepSeek-V3') {
    super();
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.siliconflow.cn/v1',
    });
    this.model = model;
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
}
