import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createGlobTool } from '../../../src/tools/glob.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Glob tool', () => {
  it('should match files by pattern', async () => {
    const testDir = join(tmpdir(), 'karen-test-glob');
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'a.txt'), 'a');
    writeFileSync(join(testDir, 'b.txt'), 'b');
    writeFileSync(join(testDir, 'c.js'), 'c');

    const tool = createGlobTool();
    const result = await tool.execute({ pattern: '**/*.txt', path: testDir });

    assert.strictEqual(result.success, true);
    const lines = result.output.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 2);
    assert.ok(lines.some(l => l.endsWith('a.txt')));
    assert.ok(lines.some(l => l.endsWith('b.txt')));

    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return empty for no matches', async () => {
    const tool = createGlobTool();
    const result = await tool.execute({ pattern: '*.nonexistent' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output.trim(), '');
  });
});
