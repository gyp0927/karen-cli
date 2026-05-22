import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createGrepTool } from '../../../src/tools/grep.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Grep tool', () => {
  it('should find matching lines', async () => {
    const testDir = join(tmpdir(), 'karen-test-grep');
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'test.txt'), 'hello world\nfoo bar\nhello again', 'utf8');

    const tool = createGrepTool();
    const result = await tool.execute({ pattern: 'hello', path: testDir });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('hello world'));
    assert.ok(result.output.includes('hello again'));
    assert.ok(!result.output.includes('foo bar'));

    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return empty for no matches', async () => {
    const testDir = join(tmpdir(), 'karen-test-grep-empty');
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'a.txt'), 'foo', 'utf8');

    const tool = createGrepTool();
    const result = await tool.execute({ pattern: 'xyz123notfound', path: testDir });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output.trim(), '');

    rmSync(testDir, { recursive: true, force: true });
  });
});
