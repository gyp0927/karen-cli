import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from 'fs';
import { join } from 'path';
import { ToolCall, TokenUsage } from '../core/types.js';
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

/** Field names that may contain secrets — redact their values in transcripts. */
const SENSITIVE_FIELDS = new Set([
  'api_key', 'apikey', 'api-key', 'key', 'secret', 'token', 'password', 'passwd', 'auth',
  'credential', 'private_key', 'privatekey', 'access_token', 'refresh_token',
  'bearer', 'authorization',
]);

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_FIELDS.has(lower) || lower.includes('secret') || lower.includes('password') || lower.includes('token');
}

/** Deep-clone and redact sensitive fields from an object. */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = typeof value === 'string' && value.length > 0 ? '***' : value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
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
    // Ensure buffered events are flushed on normal process exit
    process.once('beforeExit', () => this.flush());
  }

  private writeQueue: TranscriptEvent[] = [];
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB cap

  private write(event: TranscriptEvent): void {
    this.writeQueue.push(event);
    if (!this.writeTimer) {
      this.writeTimer = setTimeout(() => this.flush(), 500);
    }
  }

  /** Flush pending writes — call before process exit. */
  flush(): void {
    this.writeTimer = null;
    if (this.writeQueue.length === 0) return;

    try {
      // Check file size and rotate if needed
      if (existsSync(this.path)) {
        const stat = statSync(this.path);
        if (stat.size > this.MAX_FILE_SIZE) {
          const rotated = this.path.replace('.jsonl', `-${Date.now()}.jsonl`);
          renameSync(this.path, rotated);
        }
      }

      const batch = this.writeQueue.splice(0);
      const lines = batch.map(e => JSON.stringify(e)).join('\n') + '\n';
      appendFileSync(this.path, lines, 'utf8');
    } catch (err) {
      this.writeErrors++;
      if (this.writeErrors <= 3) {
        const msg = err instanceof Error ? err.message : String(err);
        Logger.warn(`Transcript write failed (${this.writeErrors}x): ${msg}`);
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
      toolArgs: redactSensitive(args),
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
    this.write({ ts: Date.now(), type: 'checkpoint', turn: this.turn, metadata: redactSensitive(metadata) });
  }

  getPath(): string {
    return this.path;
  }
}
