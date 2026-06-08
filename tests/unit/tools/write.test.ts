import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createWriteTool } from '../../../src/tools/write.js';
import { readFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_TEMP = join(process.cwd(), 'tests', 'temp');

function tempFile(name: string): string {
  return join(TEST_TEMP, name);
}

describe('Write tool', () => {
  it('should write file contents', async () => {
    mkdirSync(TEST_TEMP, { recursive: true });
    const testFile = tempFile('karen-test-write.txt');

    const tool = createWriteTool();
    const result = await tool.execute({ file_path: testFile, content: 'hello world' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'hello world');

    unlinkSync(testFile);
  });

  it('should overwrite existing file', async () => {
    mkdirSync(TEST_TEMP, { recursive: true });
    const testFile = tempFile('karen-test-write2.txt');

    const tool = createWriteTool();
    await tool.execute({ file_path: testFile, content: 'first' });
    const result = await tool.execute({ file_path: testFile, content: 'second' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'second');

    unlinkSync(testFile);
  });

  it('should reject sensitive files', async () => {
    const tool = createWriteTool();
    const sensitivePath = join(process.cwd(), 'tests', 'temp', '.ssh', 'id_rsa');
    const result = await tool.execute({ file_path: sensitivePath, content: 'test' });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('sensitive'));
  });

  it('should create backup on overwrite', async () => {
    mkdirSync(TEST_TEMP, { recursive: true });
    const testFile = tempFile('karen-test-write-backup.txt');

    const tool = createWriteTool();
    await tool.execute({ file_path: testFile, content: 'original' });
    const result = await tool.execute({ file_path: testFile, content: 'modified' });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('backup'));

    unlinkSync(testFile);
  });
});
