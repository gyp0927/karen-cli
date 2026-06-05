import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEditTool, createUndoTool, EditHistoryStore, resetEditHistory } from '../../../src/tools/edit.js';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';

const TEST_TEMP = join(process.cwd(), 'tests', 'temp');

function tempFile(name: string): string {
  return join(TEST_TEMP, name);
}

describe('Edit tool', () => {
  it('should replace text in file', async () => {
    const store = new EditHistoryStore();
    const testFile = tempFile('karen-test-edit.txt');
    mkdirSync(TEST_TEMP, { recursive: true });
    writeFileSync(testFile, 'hello world\nfoo bar', 'utf8');

    const tool = createEditTool(store);
    const result = await tool.execute({
      file_path: testFile,
      old_string: 'hello world',
      new_string: 'hi there',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'hi there\nfoo bar');

    unlinkSync(testFile);
  });

  it('should replace all occurrences', async () => {
    const store = new EditHistoryStore();
    const testFile = tempFile('karen-test-edit-all.txt');
    mkdirSync(TEST_TEMP, { recursive: true });
    writeFileSync(testFile, 'foo bar foo baz foo', 'utf8');

    const tool = createEditTool(store);
    const result = await tool.execute({
      file_path: testFile,
      old_string: 'foo',
      new_string: 'qux',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.output?.includes('3 replacement'));
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'qux bar qux baz qux');

    unlinkSync(testFile);
  });

  it('should support regex replacement', async () => {
    const store = new EditHistoryStore();
    const testFile = tempFile('karen-test-edit-regex.txt');
    mkdirSync(TEST_TEMP, { recursive: true });
    writeFileSync(testFile, 'hello 123 world 456', 'utf8');

    const tool = createEditTool(store);
    const result = await tool.execute({
      file_path: testFile,
      old_string: '\\d+',
      new_string: 'NUM',
      use_regex: true,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.output?.includes('regex replacement'));
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'hello NUM world NUM');

    unlinkSync(testFile);
  });

  it('should support regex with capture groups', async () => {
    const store = new EditHistoryStore();
    const testFile = tempFile('karen-test-edit-capture.txt');
    mkdirSync(TEST_TEMP, { recursive: true });
    writeFileSync(testFile, 'hello world', 'utf8');

    const tool = createEditTool(store);
    const result = await tool.execute({
      file_path: testFile,
      old_string: 'hello (\\w+)',
      new_string: 'hi $1',
      use_regex: true,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'hi world');

    unlinkSync(testFile);
  });

  it('should fail if regex pattern is invalid', async () => {
    const store = new EditHistoryStore();
    const testFile = tempFile('karen-test-edit-invalid-regex.txt');
    mkdirSync(TEST_TEMP, { recursive: true });
    writeFileSync(testFile, 'hello world', 'utf8');

    const tool = createEditTool(store);
    const result = await tool.execute({
      file_path: testFile,
      old_string: '[invalid',
      new_string: 'replacement',
      use_regex: true,
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Invalid regex'));

    unlinkSync(testFile);
  });

  it('should fail if old_string not found', async () => {
    const store = new EditHistoryStore();
    const testFile = tempFile('karen-test-edit2.txt');
    mkdirSync(TEST_TEMP, { recursive: true });
    writeFileSync(testFile, 'hello world', 'utf8');

    const tool = createEditTool(store);
    const result = await tool.execute({
      file_path: testFile,
      old_string: 'not found',
      new_string: 'replacement',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('not found'));

    unlinkSync(testFile);
  });

  it('should reject empty old_string', async () => {
    const store = new EditHistoryStore();
    const testFile = tempFile('karen-test-edit-empty.txt');
    mkdirSync(TEST_TEMP, { recursive: true });
    writeFileSync(testFile, 'hello world', 'utf8');

    const tool = createEditTool(store);
    const result = await tool.execute({
      file_path: testFile,
      old_string: '',
      new_string: 'replacement',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('cannot be empty'));

    unlinkSync(testFile);
  });

  it('should share history between Edit and Undo tools', async () => {
    const store = new EditHistoryStore();
    const testFile = tempFile('karen-test-edit-undo.txt');
    mkdirSync(TEST_TEMP, { recursive: true });
    writeFileSync(testFile, 'original content', 'utf8');

    const editTool = createEditTool(store);
    const undoTool = createUndoTool(store);

    // Perform an edit
    const editResult = await editTool.execute({
      file_path: testFile,
      old_string: 'original',
      new_string: 'modified',
    });
    assert.strictEqual(editResult.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'modified content');

    // Undo it
    const undoResult = await undoTool.execute({});
    assert.strictEqual(undoResult.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'original content');

    unlinkSync(testFile);
  });
});
