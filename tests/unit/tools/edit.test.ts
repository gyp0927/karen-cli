import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEditTool } from '../../../src/tools/edit.js';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Edit tool', () => {
  it('should replace text in file', async () => {
    const testFile = join(tmpdir(), 'karen-test-edit.txt');
    writeFileSync(testFile, 'hello world\nfoo bar', 'utf8');

    const tool = createEditTool();
    const result = await tool.execute({
      file_path: testFile,
      old_string: 'hello world',
      new_string: 'hi there',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'hi there\nfoo bar');

    unlinkSync(testFile);
  });

  it('should fail if old_string not found', async () => {
    const testFile = join(tmpdir(), 'karen-test-edit2.txt');
    writeFileSync(testFile, 'hello world', 'utf8');

    const tool = createEditTool();
    const result = await tool.execute({
      file_path: testFile,
      old_string: 'not found',
      new_string: 'replacement',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('not found'));

    unlinkSync(testFile);
  });
});
