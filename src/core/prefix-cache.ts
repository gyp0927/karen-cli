import { Message, ToolDefinition } from './types.js';

export interface CachedPrefix {
  /** Immutable prefix messages that should be cached by the provider. */
  prefix: Message[];
  /** Incremental / dynamic messages that change every turn. */
  dynamic: Message[];
  /** Hash of the prefix for cache invalidation. */
  hash: string;
}

/**
 * Split messages into an immutable prefix (system + tools + skills + memory)
 * and dynamic tail (history + current user input).
 *
 * For DeepSeek/SiliconFlow, placing static content at the start of messages
 * allows the provider to cache the prefix, dramatically reducing cost on
 * multi-turn conversations.
 */
export class PrefixCache {
  private lastPrefixHash?: string;

  /**
   * Build a cached split from full message list.
   * @param allMessages   Complete message array (system + history + user)
   * @param systemPrompt  The system prompt string (may include memories)
   * @param tools         Active tool definitions
   */
  build(
    allMessages: Message[],
    systemPrompt: string,
    tools?: ToolDefinition[]
  ): CachedPrefix {
    // Find the system message index
    const systemIdx = allMessages.findIndex(m => m.role === 'system');

    // Everything up to and including the system message + tool definitions
    // is considered immutable prefix.
    const prefix: Message[] = [];
    const dynamic: Message[] = [];

    if (systemIdx !== -1) {
      prefix.push(allMessages[systemIdx]);
    }

    // All non-system messages after system are dynamic
    for (let i = 0; i < allMessages.length; i++) {
      if (i === systemIdx) continue;
      dynamic.push(allMessages[i]);
    }

    // If no system message was found, treat everything as dynamic
    if (systemIdx === -1) {
      return { prefix: [], dynamic: allMessages, hash: this.hash('') };
    }

    const toolsHash = this.hash(JSON.stringify(tools || []));
    const prefixHash = this.hash(systemPrompt + toolsHash);

    this.lastPrefixHash = prefixHash;

    return { prefix, dynamic, hash: prefixHash };
  }

  /**
   * Check if the prefix has changed compared to previous build.
   * If unchanged, the provider can reuse the cached prefix.
   */
  isPrefixUnchanged(hash: string): boolean {
    return this.lastPrefixHash === hash;
  }

  /** Simple djb2 hash for fast comparison. */
  private hash(str: string): string {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
    }
    return String(h >>> 0);
  }
}
