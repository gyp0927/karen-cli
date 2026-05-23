import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createEditTool, createUndoTool } from '../../../src/tools/edit.js';
import { writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Undo tool', () => {
  let testDir: string;
  let editTool: ReturnType<typeof createEditTool>;
  let undoTool: ReturnType<typeof createUndoTool>;

  beforeEach(() => {
    testDir = join(tmpdir(), `karen-undo-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    editTool = createEditTool();
    undoTool = createUndoTool();
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should undo last edit', async () => {
    const filePath = join(testDir, 'test.txt');
    writeFileSync(filePath, 'hello world', 'utf8');

    const edit = await editTool.execute({ file_path: filePath, old_string: 'world', new_string: 'universe' });
    assert.strictEqual(edit.success, true);
    assert.strictEqual(readFileSync(filePath, 'utf8'), 'hello universe');

    const undo = await undoTool.execute({});
    assert.strictEqual(undo.success, true);
    assert.strictEqual(readFileSync(filePath, 'utf8'), 'hello world');
  });

  it('should undo edit by file path', async () => {
    const fileA = join(testDir, 'a.txt');
    const fileB = join(testDir, 'b.txt');
    writeFileSync(fileA, 'alpha', 'utf8');
    writeFileSync(fileB, 'beta', 'utf8');

    await editTool.execute({ file_path: fileA, old_string: 'alpha', new_string: 'ALPHA' });
    await editTool.execute({ file_path: fileB, old_string: 'beta', new_string: 'BETA' });

    const undo = await undoTool.execute({ file_path: fileA });
    assert.strictEqual(undo.success, true);
    assert.strictEqual(readFileSync(fileA, 'utf8'), 'alpha');
    assert.strictEqual(readFileSync(fileB, 'utf8'), 'BETA');
  });

  it('should return error when nothing to undo', async () => {
    const result = await undoTool.execute({});
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('No edits'));
  });

  it('should undo multiple edits with count', async () => {
    const filePath = join(testDir, 'multi.txt');
    writeFileSync(filePath, 'abc', 'utf8');

    await editTool.execute({ file_path: filePath, old_string: 'abc', new_string: 'def' });
    await editTool.execute({ file_path: filePath, old_string: 'def', new_string: 'ghi' });

    const undo = await undoTool.execute({ count: 2 });
    assert.strictEqual(undo.success, true);
    assert.strictEqual(readFileSync(filePath, 'utf8'), 'abc');
  });
});
