import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCommand } from '../../src/cli/commands.js';

describe('CLI Commands', () => {
  it('should parse /exit command', () => {
    const cmd = parseCommand('/exit');
    assert.ok(cmd);
    assert.strictEqual(cmd!.type, 'exit');
  });

  it('should parse /model command', () => {
    const cmd = parseCommand('/model claude');
    assert.ok(cmd);
    assert.strictEqual(cmd!.type, 'model');
    assert.strictEqual(cmd!.args, 'claude');
  });

  it('should return null for normal input', () => {
    const cmd = parseCommand('hello world');
    assert.strictEqual(cmd, null);
  });
});
