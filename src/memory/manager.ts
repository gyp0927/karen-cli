import { Memory, MemoryInput, MemoryQuery } from './types.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

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

  async save(input: MemoryInput): Promise<Memory> {
    const now = Date.now();
    const memory: Memory = {
      id: randomUUID(),
      type: input.type,
      content: input.content,
      tags: input.tags || [],
      createdAt: now,
      updatedAt: now,
    };
    this.writeMemory(memory);
    return memory;
  }

  async update(id: string, updates: Partial<Omit<MemoryInput, 'type'>> & Partial<Pick<Memory, 'type'>>): Promise<Memory | null> {
    const existing = this.readMemory(id);
    if (!existing) return null;

    const updated: Memory = {
      ...existing,
      ...updates,
      tags: updates.tags || existing.tags,
      updatedAt: Date.now(),
    };
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

  async load(query: MemoryQuery = {}): Promise<Memory[]> {
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

    return memories.filter(memory => {
      if (query.type && memory.type !== query.type) return false;

      if (query.tags && query.tags.length > 0) {
        const hasTag = query.tags.some(tag => memory.tags.includes(tag));
        if (!hasTag) return false;
      }

      if (query.keywords && query.keywords.length > 0) {
        const text = `${memory.content} ${memory.tags.join(' ')}`.toLowerCase();
        const hasKeyword = query.keywords.some(kw => text.includes(kw.toLowerCase()));
        if (!hasKeyword) return false;
      }

      return true;
    });
  }

  async loadAll(): Promise<Memory[]> {
    return this.load();
  }
}
