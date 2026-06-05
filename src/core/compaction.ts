import { Message } from './types.js';

export interface CompactionResult {
  messages: Message[];
  summary?: string;
  dropped: number;
}

export class ContextCompactor {
  private maxTokens: number;
  private keepRecent: number;

  constructor(maxTokens = 80000, keepRecent = 20) {
    this.maxTokens = maxTokens;
    this.keepRecent = keepRecent;
  }

  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  estimateMessageTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => {
      let tokens = this.estimateTokens(m.content);
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          tokens += this.estimateTokens(tc.name);
          tokens += this.estimateTokens(JSON.stringify(tc.arguments));
        }
      }
      return sum + tokens;
    }, 0);
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
    // Single-pass split into system and non-system messages
    const systemMessages: Message[] = [];
    const nonSystemMessages: Message[] = [];
    for (const m of messages) {
      if (m.role === 'system') {
        systemMessages.push(m);
      } else {
        nonSystemMessages.push(m);
      }
    }

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

    // If there were old messages, build a structured summary
    if (oldMessages.length > 0) {
      summary = this.buildSummary(oldMessages);
      resultMessages.splice(systemMessages.length, 0, {
        role: 'system',
        content: summary,
      });
    }

    return { messages: resultMessages, summary, dropped };
  }

  /** Build a structured summary from dropped messages to preserve context. */
  private buildSummary(messages: Message[]): string {
    const parts: string[] = [];
    const toolCalls: Map<string, number> = new Map();
    const userMessages: string[] = [];
    const fileReads: string[] = [];
    const fileEdits: string[] = [];
    let lastAssistantText = '';

    for (const m of messages) {
      if (m.role === 'user') {
        userMessages.push(m.content.slice(0, 200));
      } else if (m.role === 'assistant') {
        if (m.content && m.content.trim()) {
          lastAssistantText = m.content.trim().slice(0, 300);
        }
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            toolCalls.set(tc.name, (toolCalls.get(tc.name) || 0) + 1);
            if (tc.name === 'Read' && tc.arguments.file_path) {
              fileReads.push(String(tc.arguments.file_path));
            }
            if ((tc.name === 'Write' || tc.name === 'Edit') && tc.arguments.file_path) {
              fileEdits.push(String(tc.arguments.file_path));
            }
          }
        }
      }
    }

    parts.push(`[Context compacted: ${messages.length} earlier messages summarized]`);

    if (userMessages.length > 0) {
      parts.push(`User requests: ${userMessages.join(' | ')}`);
    }

    if (toolCalls.size > 0) {
      const toolSummary = [...toolCalls.entries()]
        .map(([name, count]) => `${name}(${count})`)
        .join(', ');
      parts.push(`Tools used: ${toolSummary}`);
    }

    if (fileReads.length > 0) {
      const unique = [...new Set(fileReads)].slice(0, 10);
      parts.push(`Files read: ${unique.join(', ')}`);
    }

    if (fileEdits.length > 0) {
      const unique = [...new Set(fileEdits)].slice(0, 10);
      parts.push(`Files modified: ${unique.join(', ')}`);
    }

    if (lastAssistantText) {
      parts.push(`Last response: ${lastAssistantText}`);
    }

    parts.push('Continue from where you left off. You already have the context above — do NOT re-read files that were already read.');

    return parts.join('\n');
  }
}
