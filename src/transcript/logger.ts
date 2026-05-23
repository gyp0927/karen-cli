import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Message, ToolCall, TokenUsage } from '../core/types.js';
import { Logger } from '../utils/logger.js';

export interface TranscriptEvent {
  ts: number;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system' | 'error' | 'plan' | 'checkpoint';
  turn?: number;
  content?: string;
  toolCalls?: ToolCall[];
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  usage?: TokenUsage;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class TranscriptLogger {
  private path: string;
  private turn = 0;
  private writeErrors = 0;

  constructor(basePath: string) {
    const dir = join(basePath, '.karen', 'transcripts');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const filename = `session-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    this.path = join(dir, filename);
  }

  private write(event: TranscriptEvent): void {
    try {
      appendFileSync(this.path, JSON.stringify(event) + '\n', 'utf8');
    } catch (err) {
      this.writeErrors++;
      if (this.writeErrors <= 3) {
        Logger.warn(`Transcript write failed (${this.writeErrors}x): ${(err as Error).message}`);
      }
    }
  }

  startTurn(): void {
    this.turn++;
  }

  logUser(content: string): void {
    this.write({ ts: Date.now(), type: 'user', turn: this.turn, content });
  }

  logAssistant(content: string, toolCalls?: ToolCall[], usage?: TokenUsage): void {
    this.write({
      ts: Date.now(),
      type: 'assistant',
      turn: this.turn,
      content,
      toolCalls,
      usage,
    });
  }

  logToolCall(name: string, args: Record<string, unknown>): void {
    this.write({
      ts: Date.now(),
      type: 'tool_call',
      turn: this.turn,
      toolName: name,
      toolArgs: args,
    });
  }

  logToolResult(name: string, result: string, error?: string): void {
    this.write({
      ts: Date.now(),
      type: 'tool_result',
      turn: this.turn,
      toolName: name,
      toolResult: result,
      error,
    });
  }

  logError(error: string): void {
    this.write({ ts: Date.now(), type: 'error', turn: this.turn, error });
  }

  logSystem(content: string): void {
    this.write({ ts: Date.now(), type: 'system', turn: this.turn, content });
  }

  logCheckpoint(metadata: Record<string, unknown>): void {
    this.write({ ts: Date.now(), type: 'checkpoint', turn: this.turn, metadata });
  }

  getPath(): string {
    return this.path;
  }
}
