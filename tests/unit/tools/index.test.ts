import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createIndexTool } from '../../../src/tools/index.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Index tool', () => {
  let testDir: string;
  let tool: ReturnType<typeof createIndexTool>;

  beforeEach(() => {
    testDir = join(tmpdir(), `karen-index-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'src', 'components'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'index.ts'), 'export {};', 'utf8');
    writeFileSync(join(testDir, 'src', 'components', 'Button.tsx'), 'export const Button = () => {};', 'utf8');
    writeFileSync(join(testDir, 'README.md'), '# Project', 'utf8');
    writeFileSync(join(testDir, 'package.json'), '{}', 'utf8');
    tool = createIndexTool();
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should scan project', async () => {
    const result = await tool.execute({ operation: 'scan', path: testDir });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('4 files'));
  });

  it('should show stats', async () => {
    await tool.execute({ operation: 'scan', path: testDir });
    const result = await tool.execute({ operation: 'stats', path: testDir });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('Total files'));
  });

  it('should find files by pattern', async () => {
    await tool.execute({ operation: 'scan', path: testDir });
    const result = await tool.execute({ operation: 'find', path: testDir, pattern: '.ts' });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('index.ts'));
  });

  it('should show language breakdown', async () => {
    await tool.execute({ operation: 'scan', path: testDir });
    const result = await tool.execute({ operation: 'languages', path: testDir });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('.ts'));
  });

  it('should show tree', async () => {
    const result = await tool.execute({ operation: 'tree', path: testDir });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('src'));
  });

  it('should handle empty find results', async () => {
    await tool.execute({ operation: 'scan', path: testDir });
    const result = await tool.execute({ operation: 'find', path: testDir, pattern: 'nonexistent' });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('No files'));
  });
});
