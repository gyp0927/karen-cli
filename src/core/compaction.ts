import { Message } from './types.js';

export interface CompactionResult {
  messages: Message[];
  summary?: string;
  dropped: number;
}

export class ContextCompactor {
  private maxTokens: number;
  private keepRecent: number;

  constructor(maxTokens = 8000, keepRecent = 10) {
    this.maxTokens = maxTokens;
    this.keepRecent = keepRecent;
  }

  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  estimateMessageTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
  }

  truncateToolResult(output: string, maxLines = 100): string {
    const lines = output.split('\n');
    if (lines.length <= maxLines) return output;

    const keepStart = Math.ceil(maxLines * 0.66);
    const keepEnd = Math.floor(maxLines * 0.34);
    const dropped = lines.length - keepStart - keepEnd;

    const start = lines.slice(0, keepStart).join('\n');
    const end = lines.slice(-keepEnd).join('\n');
    return `${start}\n[... ${dropped} lines truncated ...]\n${end}`;
  }

  compact(messages: Message[]): CompactionResult {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // If under limit, no compaction needed
    const totalTokens = this.estimateMessageTokens(messages);
    if (totalTokens <= this.maxTokens) {
      return { messages: [...messages], dropped: 0 };
    }

    // Strategy: keep system messages + recent N messages, summarize/drop the rest
    const keepCount = Math.min(this.keepRecent, nonSystemMessages.length);
    const recentMessages = nonSystemMessages.slice(-keepCount);
    const oldMessages = nonSystemMessages.slice(0, -keepCount);

    let resultMessages = [...systemMessages, ...recentMessages];
    let dropped = oldMessages.length;
    let summary: string | undefined;

    // If still over limit, truncate tool results in recent messages
    const resultTokens = this.estimateMessageTokens(resultMessages);
    if (resultTokens > this.maxTokens) {
      resultMessages = resultMessages.map(m => {
        if (m.role === 'tool' && m.content.length > 2000) {
          return { ...m, content: this.truncateToolResult(m.content, 50) };
        }
        return m;
      });
    }

    // If there were old messages, add a summary placeholder
    if (oldMessages.length > 0) {
      summary = `[${oldMessages.length} earlier messages summarized]`;
      resultMessages.splice(systemMessages.length, 0, {
        role: 'system',
        content: summary,
      });
    }

    return { messages: resultMessages, summary, dropped };
  }
}
