// Core type definitions for karen-cli

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface IProvider {
  name: string;
  chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse>;
}

export interface ProviderResponse {
  content?: string;
  tool_calls?: ToolCall[];
  usage?: TokenUsage;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface LoopConfig {
  maxIterations: number;
  provider: IProvider;
  tools: Tool[];
}
