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

export type ErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'TIMEOUT' | 'RATE_LIMITED' | 'INTERNAL_ERROR';

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  /** Machine-readable error code for programmatic handling. */
  errorCode?: ErrorCode;
}

export interface StreamChunk {
  type: 'text' | 'tool_calls' | 'usage';
  content?: string;
  tool_calls?: ToolCall[];
  usage?: TokenUsage;
}

export interface IProvider {
  name: string;
  model: string;
  chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse>;
  streamChat?(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk, void, unknown>;
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
  maxIterations?: number;
  provider: IProvider;
  tools: Tool[];
}
