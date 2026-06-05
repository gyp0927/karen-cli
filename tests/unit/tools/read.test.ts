import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createReadTool } from '../../../src/tools/read.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_TEMP = join(process.cwd(), 'tests', 'temp');

function tempFile(name: string): string {
  return join(TEST_TEMP, name);
}

describe('Read tool', () => {
  it('can read a file\'s contents', async () => {
    const tool = createReadTool();
    mkdirSync(TEST_TEMP, { recursive: true });
    const testFile = tempFile(`karen-read-test-${Date.now()}.txt`);
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
    assert.ok(
      result.error!.includes('ENOENT') ||
      result.error!.includes('no such file') ||
      result.error!.includes('not found') ||
      result.error!.includes('Invalid or unsafe')
    );
  });

  it('supports reading specific line range', async () => {
    const tool = createReadTool();
    mkdirSync(TEST_TEMP, { recursive: true });
    const testFile = tempFile(`karen-read-range-${Date.now()}.txt`);
    const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
    writeFileSync(testFile, lines.join('\n'), 'utf8');

    try {
      const result = await tool.execute({ file_path: testFile, offset: 2, limit: 2 });
      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('[Lines 2-3 of 5]'));
      assert.ok(result.output?.includes('Line 2'));
      assert.ok(result.output?.includes('Line 3'));
      assert.ok(!result.output?.includes('Line 1'));
      assert.ok(!result.output?.includes('Line 4'));
    } finally {
      unlinkSync(testFile);
    }
  });

  it('handles offset beyond file length', async () => {
    const tool = createReadTool();
    mkdirSync(TEST_TEMP, { recursive: true });
    const testFile = tempFile(`karen-read-beyond-${Date.now()}.txt`);
    writeFileSync(testFile, 'Line 1\nLine 2', 'utf8');

    try {
      const result = await tool.execute({ file_path: testFile, offset: 10, limit: 5 });
      assert.strictEqual(result.success, true);
      assert.ok(result.output?.includes('[Lines 10-2 of 2]'));
    } finally {
      unlinkSync(testFile);
    }
  });
});
