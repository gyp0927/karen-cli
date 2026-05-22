import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { MemoryManager } from '../../../src/memory/manager.js';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MemoryManager', () => {
  let baseDir: string;
  let manager: MemoryManager;

  beforeEach(() => {
    baseDir = join(tmpdir(), `karen-memory-test-${Date.now()}`);
    mkdirSync(baseDir, { recursive: true });
    manager = new MemoryManager(baseDir);
  });

  afterEach(() => {
    try {
      rmSync(baseDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should save and retrieve a memory', async () => {
    const memory = await manager.save({
      type: 'project',
      content: 'Use TypeScript for all new files',
      tags: ['tech-stack', 'typescript'],
    });

    assert.strictEqual(memory.type, 'project');
    assert.strictEqual(memory.content, 'Use TypeScript for all new files');
    assert.deepStrictEqual(memory.tags, ['tech-stack', 'typescript']);
    assert.ok(memory.id);
    assert.ok(memory.createdAt);

    const retrieved = await manager.getById(memory.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved!.content, memory.content);
  });

  it('should load memories by type', async () => {
    await manager.save({ type: 'project', content: 'A', tags: [] });
    await manager.save({ type: 'user', content: 'B', tags: [] });
    await manager.save({ type: 'project', content: 'C', tags: [] });

    const projects = await manager.load({ type: 'project' });
    assert.strictEqual(projects.length, 2);
    assert.ok(projects.every(m => m.type === 'project'));
  });

  it('should load memories by tags', async () => {
    await manager.save({ type: 'project', content: 'A', tags: ['important'] });
    await manager.save({ type: 'project', content: 'B', tags: ['low-priority'] });
    await manager.save({ type: 'user', content: 'C', tags: ['important'] });

    const important = await manager.load({ tags: ['important'] });
    assert.strictEqual(important.length, 2);
  });

  it('should load memories by keywords', async () => {
    await manager.save({ type: 'project', content: 'Use React for frontend', tags: [] });
    await manager.save({ type: 'project', content: 'Use Vue for dashboard', tags: [] });
    await manager.save({ type: 'user', content: 'I prefer dark mode', tags: [] });

    const reactMemories = await manager.load({ keywords: ['React'] });
    assert.strictEqual(reactMemories.length, 1);
    assert.ok(reactMemories[0].content.includes('React'));
  });

  it('should delete a memory', async () => {
    const memory = await manager.save({ type: 'project', content: 'To be deleted', tags: [] });
    const deleted = await manager.delete(memory.id);
    assert.strictEqual(deleted, true);

    const retrieved = await manager.getById(memory.id);
    assert.strictEqual(retrieved, null);
  });

  it('should update a memory', async () => {
    const memory = await manager.save({ type: 'project', content: 'Original', tags: [] });
    const updated = await manager.update(memory.id, { content: 'Updated' });

    assert.ok(updated);
    assert.strictEqual(updated!.content, 'Updated');
    assert.strictEqual(updated!.type, 'project');
    assert.ok(updated!.updatedAt > memory.updatedAt);
  });

  it('should return null for non-existent memory', async () => {
    const result = await manager.getById('non-existent-id');
    assert.strictEqual(result, null);
  });

  it('should auto-create memory directory', async () => {
    const autoDir = join(tmpdir(), `karen-memory-auto-${Date.now()}`);
    rmSync(autoDir, { recursive: true, force: true });

    const autoManager = new MemoryManager(autoDir);
    const memory = await autoManager.save({ type: 'project', content: 'Auto', tags: [] });
    assert.ok(memory.id);

    rmSync(autoDir, { recursive: true, force: true });
  });
});
