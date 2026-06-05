// Lightweight token estimator that works without external dependencies.
// For English: ~4 chars per token. For CJK: ~1.5 chars per token. For code: mixed.
// Replace with js-tiktoken or model-specific tokenizer when available.

export interface TokenCount {
  tokens: number;
  chars: number;
}

export class LocalTokenizer {
  /** Estimate tokens for a piece of text. */
  estimate(text: string): TokenCount {
    const chars = text.length;
    // Fast path for ASCII-only text (most common for code): ~4 chars per token
    if (/^[\x00-\x7F]*$/.test(text)) {
      return { tokens: Math.ceil(chars / 4), chars };
    }

    let tokens = 0;
    // Character-by-character heuristic for CJK/non-ASCII text
    for (const ch of text) {
      const cp = ch.codePointAt(0) || 0;
      if ((cp >= 0x4E00 && cp <= 0x9FFF) ||
          (cp >= 0x3400 && cp <= 0x4DBF) ||
          (cp >= 0x2E80 && cp <= 0x2EFF) ||
          (cp >= 0x3000 && cp <= 0x303F) ||
          (cp >= 0x3040 && cp <= 0x309F) ||
          (cp >= 0x30A0 && cp <= 0x30FF) ||
          (cp >= 0xAC00 && cp <= 0xD7AF) ||
          (cp >= 0xF900 && cp <= 0xFAFF)) {
        tokens += 1.5;
      } else if (cp > 127) {
        tokens += 2;
      } else if (/\s/.test(ch)) {
        tokens += 0.25;
      } else if (/[a-zA-Z0-9]/.test(ch)) {
        tokens += 0.3;
      } else {
        tokens += 0.5;
      }
    }
    return { tokens: Math.ceil(tokens), chars };
  }

  /** Estimate tokens for an array of messages (including overhead per message). */
  estimateMessages(messages: { role: string; content: string }[]): TokenCount {
    let totalTokens = 0;
    let totalChars = 0;
    for (const m of messages) {
      const est = this.estimate(m.content);
      totalTokens += est.tokens + 4; // overhead per message
      totalChars += est.chars;
    }
    return { tokens: Math.ceil(totalTokens), chars: totalChars };
  }
}

export const defaultTokenizer = new LocalTokenizer();
