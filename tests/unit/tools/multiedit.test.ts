import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createEditTool } from '../../../src/tools/edit.js';
import { writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_TEMP = join(process.cwd(), 'tests', 'temp');

describe('Multi-file Edit', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(TEST_TEMP, 'karen-multiedit-' + Date.now());
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('applies same edit to multiple files via targets', async () => {
    const edit = createEditTool();
    const f1 = join(testDir, 'a.ts');
    const f2 = join(testDir, 'b.ts');
    writeFileSync(f1, 'const x = 1;', 'utf8');
    writeFileSync(f2, 'const x = 1;', 'utf8');

    const result = await edit.execute({
      targets: [f1, f2],
      old_string: 'const x = 1;',
      new_string: 'const x: number = 1;',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('2 file'));
    assert.strictEqual(readFileSync(f1, 'utf8'), 'const x: number = 1;');
    assert.strictEqual(readFileSync(f2, 'utf8'), 'const x: number = 1;');
  });

  it('skips file if old_string not found in multi-target mode', async () => {
    const edit = createEditTool();
    const f1 = join(testDir, 'x.ts');
    const f2 = join(testDir, 'y.ts');
    writeFileSync(f1, 'hello', 'utf8');
    writeFileSync(f2, 'world', 'utf8');

    const result = await edit.execute({
      targets: [f1, f2],
      old_string: 'hello',
      new_string: 'hi',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('1 file'));
    assert.ok(result.output.includes('skipped') || result.output.includes('not found'));
  });

  it('requires file_path or targets', async () => {
    const edit = createEditTool();
    const result = await edit.execute({ old_string: 'a', new_string: 'b' });
    assert.strictEqual(result.success, false);
  });
});
