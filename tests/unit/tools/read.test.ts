import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createReadTool } from '../../../src/tools/read.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Read tool', () => {
  it('can read a file\'s contents', async () => {
    const tool = createReadTool();
    const testFile = join(tmpdir(), `karen-read-test-${Date.now()}.txt`);
    const content = 'Hello, Karen!';
    writeFileSync(testFile, content, 'utf8');

    try {
      const result = await tool.execute({ file_path: testFile });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, content);
      assert.strictEqual(result.error, undefined);
    } finally {
      unlinkSync(testFile);
    }
  });

  it('fails gracefully for non-existent file', async () => {
    const tool = createReadTool();
    const result = await tool.execute({ file_path: '/nonexistent/path/file.txt' });
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error!.includes('ENOENT') || result.error!.includes('no such file') || result.error!.includes('not found'));
  });
});
