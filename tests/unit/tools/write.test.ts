import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createWriteTool } from '../../../src/tools/write.js';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Write tool', () => {
  it('should write file contents', async () => {
    const testFile = join(tmpdir(), 'karen-test-write.txt');

    const tool = createWriteTool();
    const result = await tool.execute({ file_path: testFile, content: 'hello world' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'hello world');

    unlinkSync(testFile);
  });

  it('should overwrite existing file', async () => {
    const testFile = join(tmpdir(), 'karen-test-write2.txt');

    const tool = createWriteTool();
    await tool.execute({ file_path: testFile, content: 'first' });
    const result = await tool.execute({ file_path: testFile, content: 'second' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'second');

    unlinkSync(testFile);
  });
});
