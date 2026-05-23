import { Memory, MemoryInput, MemoryQuery, MemoryType, DEFAULT_TTL, SUMMARIZE_THRESHOLD, SUMMARY_MAX_LENGTH } from './types.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID, createHash } from 'crypto';
import { Logger } from '../utils/logger.js';

export class MemoryManager {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || join(process.cwd(), '.karen', 'memory');
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  private getFilePath(id: string): string {
    return join(this.basePath, `${id}.json`);
  }

  private writeMemory(memory: Memory): void {
    writeFileSync(this.getFilePath(memory.id), JSON.stringify(memory, null, 2), 'utf8');
  }

  private readMemory(id: string): Memory | null {
    try {
      const content = readFileSync(this.getFilePath(id), 'utf8');
      return JSON.parse(content) as Memory;
    } catch {
      return null;
    }
  }

  /** Compute a simple content hash for deduplication. */
  private hashContent(content: string): string {
    // Normalize: trim, lowercase, collapse whitespace
    const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  /** Simple extractive summarization for long content. */
  private summarize(text: string): string {
    const sentences = text.split(/(?<=[。！？.!?])\s+/).filter(s => s.trim().length > 0);
    if (sentences.length <= 3) return text.slice(0, SUMMARY_MAX_LENGTH);

    // Keep first sentence, last sentence, and any sentence with keywords
    const keywords = ['important', 'critical', 'must', 'always', 'never', 'bug', 'fix', 'error', 'key', 'note', 'warning'];
    const picked: string[] = [sentences[0]];

    for (let i = 1; i < sentences.length - 1; i++) {
      const lower = sentences[i].toLowerCase();
      if (keywords.some(kw => lower.includes(kw))) {
        picked.push(sentences[i]);
      }
    }

    if (sentences.length > 1) {
      picked.push(sentences[sentences.length - 1]);
    }

    let summary = picked.join(' ');
    if (summary.length > SUMMARY_MAX_LENGTH) {
      summary = summary.slice(0, SUMMARY_MAX_LENGTH) + '...';
    }
    return summary;
  }

  /** Check if an identical or near-identical memory already exists. */
  private async findDuplicate(contentHash: string, type: MemoryType): Promise<Memory | null> {
    const all = await this.load({ type, includeExpired: true });
    return all.find(m => m.contentHash === contentHash) || null;
  }

  async save(input: MemoryInput): Promise<Memory> {
    const now = Date.now();
    const contentHash = this.hashContent(input.content);

    // Deduplication: if same content + same type already exists, update timestamp instead of creating new
    if (!input.force) {
      const existing = await this.findDuplicate(contentHash, input.type);
      if (existing) {
        existing.updatedAt = now;
        existing.tags = [...new Set([...existing.tags, ...(input.tags || [])])];
        this.writeMemory(existing);
        Logger.debug(`Memory dedup: updated existing ${existing.id} instead of creating duplicate`);
        return existing;
      }
    }

    // Auto-summarize if content is too long
    let summary: string | undefined;
    let finalContent = input.content;
    if (input.content.length > SUMMARIZE_THRESHOLD) {
      summary = this.summarize(input.content);
      // Store full content but use summary in prompts
      finalContent = input.content;
    }

    // Compute expiration (ttlDays <= 0 means permanent)
    const ttlDays = input.ttlDays ?? DEFAULT_TTL[input.type];
    const expiresAt = ttlDays > 0 ? now + ttlDays * 24 * 60 * 60 * 1000 : undefined;

    const memory: Memory = {
      id: randomUUID(),
      type: input.type,
      content: finalContent,
      summary,
      tags: input.tags || [],
      createdAt: now,
      updatedAt: now,
      expiresAt,
      contentHash,
    };

    this.writeMemory(memory);
    Logger.debug(`Memory saved: ${memory.id} (type=${memory.type}, ttl=${ttlDays}d)`);
    return memory;
  }

  async update(id: string, updates: Partial<Omit<MemoryInput, 'type'>> & Partial<Pick<Memory, 'type'>>): Promise<Memory | null> {
    const existing = this.readMemory(id);
    if (!existing) return null;

    const now = Date.now();
    const updated: Memory = {
      ...existing,
      ...updates,
      tags: updates.tags || existing.tags,
      updatedAt: now,
    };

    if (updates.content) {
      updated.contentHash = this.hashContent(updates.content);
      if (updates.content.length > SUMMARIZE_THRESHOLD) {
        updated.summary = this.summarize(updates.content);
      } else {
        updated.summary = undefined;
      }
    }

    this.writeMemory(updated);
    return updated;
  }

  async getById(id: string): Promise<Memory | null> {
    return this.readMemory(id);
  }

  async delete(id: string): Promise<boolean> {
    try {
      unlinkSync(this.getFilePath(id));
      return true;
    } catch {
      return false;
    }
  }

  /** Delete all expired memories. Returns count of deleted items. */
  async cleanup(): Promise<number> {
    const now = Date.now();
    const files = readdirSync(this.basePath).filter(f => f.endsWith('.json'));
    let deleted = 0;

    for (const file of files) {
      try {
        const content = readFileSync(join(this.basePath, file), 'utf8');
        const memory = JSON.parse(content) as Memory;
        if (memory.expiresAt && memory.expiresAt < now) {
          unlinkSync(join(this.basePath, file));
          deleted++;
        }
      } catch {
        // Skip invalid files
      }
    }

    if (deleted > 0) {
      Logger.info(`Memory cleanup: removed ${deleted} expired memories`);
    }
    return deleted;
  }

  async load(query: MemoryQuery = {}): Promise<Memory[]> {
    const now = Date.now();
    const files = readdirSync(this.basePath).filter(f => f.endsWith('.json'));
    const memories: Memory[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(this.basePath, file), 'utf8');
        const memory = JSON.parse(content) as Memory;
        memories.push(memory);
      } catch {
        // Skip invalid files
      }
    }

    // Apply filters
    let filtered = memories.filter(memory => {
      // Filter out expired unless explicitly included
      if (!query.includeExpired && memory.expiresAt && memory.expiresAt < now) {
        return false;
      }

      if (query.type && memory.type !== query.type) return false;

      if (query.tags && query.tags.length > 0) {
        const hasTag = query.tags.some(tag => memory.tags.includes(tag));
        if (!hasTag) return false;
      }

      if (query.keywords && query.keywords.length > 0) {
        const text = `${memory.content} ${memory.summary || ''} ${memory.tags.join(' ')}`.toLowerCase();
        const hasKeyword = query.keywords.some(kw => text.includes(kw.toLowerCase()));
        if (!hasKeyword) return false;
      }

      return true;
    });

    // Sort by priority and recency (four-layer stack):
    // project > global > user > skill
    const priority: Record<MemoryType, number> = {
      project: 4,
      global: 3,
      user: 2,
      skill: 1,
      feedback: 1,
      reference: 0,
    };

    filtered.sort((a, b) => {
      const pa = priority[a.type] ?? 0;
      const pb = priority[b.type] ?? 0;
      if (pa !== pb) return pb - pa;
      return b.updatedAt - a.updatedAt;
    });

    return filtered;
  }

  async loadAll(): Promise<Memory[]> {
    return this.load();
  }

  /** Load memories from all four layers for a given context. */
  async loadStack(options: { cwd?: string; keywords?: string[] } = {}): Promise<Record<MemoryType, Memory[]>> {
    const result: Record<string, Memory[]> = {
      project: [],
      global: [],
      user: [],
      skill: [],
      feedback: [],
      reference: [],
    };

    const all = await this.load();
    for (const m of all) {
      if (!result[m.type]) result[m.type] = [];
      result[m.type].push(m);
    }

    // Filter project memories by cwd if provided
    if (options.cwd) {
      result.project = result.project.filter(m =>
        m.tags.some(t => t.includes(options.cwd!))
      );
    }

    // Filter by keywords if provided
    if (options.keywords && options.keywords.length > 0) {
      for (const type of Object.keys(result)) {
        result[type] = result[type].filter(m => {
          const text = `${m.content} ${m.summary || ''} ${m.tags.join(' ')}`.toLowerCase();
          return options.keywords!.some(kw => text.includes(kw.toLowerCase()));
        });
      }
    }

    return result as Record<MemoryType, Memory[]>;
  }
}
