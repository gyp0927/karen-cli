import { IProvider, Message, ToolDefinition, ProviderResponse } from '../core/types.js';

export abstract class BaseProvider implements IProvider {
  abstract name: string;
  abstract readonly model: string;
  abstract chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse>;
}
