import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ToolCallRepair } from '../../../src/core/repair.js';

describe('ToolCallRepair', () => {
  const repair = new ToolCallRepair();

  it('passes through valid tool calls unchanged', () => {
    const valid = [
      { id: 'call_1', name: 'Read', arguments: { file_path: '/tmp/test.txt' } },
    ];
    const result = repair.repair(valid);
    assert.strictEqual(result.repaired.length, 1);
    assert.strictEqual(result.wasRepaired, false);
    assert.deepStrictEqual(result.repaired[0], valid[0]);
  });

  it('repairs null/undefined inputs by skipping them', () => {
    const result = repair.repair([null, undefined]);
    assert.strictEqual(result.repaired.length, 0);
    assert.strictEqual(result.wasRepaired, true);
    assert.ok(result.error);
  });

  it('repairs partial object missing arguments', () => {
    const partial = [
      { id: 'call_2', name: 'Write', arguments: undefined },
    ];
    const result = repair.repair(partial as unknown[]);
    assert.strictEqual(result.repaired.length, 1);
    assert.strictEqual(result.repaired[0].name, 'Write');
    assert.deepStrictEqual(result.repaired[0].arguments, {});
    assert.strictEqual(result.wasRepaired, true);
  });

  it('repairs object with nested function property', () => {
    const nested = [
      { id: 'call_3', function: { name: 'Bash', arguments: { command: 'ls' } } },
    ];
    const result = repair.repair(nested as unknown[]);
    assert.strictEqual(result.repaired.length, 1);
    assert.strictEqual(result.repaired[0].name, 'Bash');
    assert.deepStrictEqual(result.repaired[0].arguments, { command: 'ls' });
  });

  it('repairs string-ified JSON object', () => {
    const str = '{"id":"call_4","name":"Grep","arguments":{"pattern":"foo"}}';
    const result = repair.repair([str]);
    assert.strictEqual(result.repaired.length, 1);
    assert.strictEqual(result.repaired[0].name, 'Grep');
  });

  it('repairs truncated JSON missing closing brace', () => {
    const truncated = '{"id":"call_5","name":"Read","arguments":{"file_path":"/tmp/a.txt"';
    const result = repair.repair([truncated]);
    assert.strictEqual(result.repaired.length, 1);
    assert.strictEqual(result.repaired[0].name, 'Read');
  });

  it('repairs JSON with trailing commas', () => {
    const badJson = '{"id":"call_6","name":"Edit","arguments":{"a":1,}}';
    const result = repair.repair([badJson]);
    assert.strictEqual(result.repaired.length, 1);
    assert.strictEqual(result.repaired[0].name, 'Edit');
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n{"id":"call_7","name":"Write","arguments":{"content":"hi"}}\n```';
    const result = repair.repair([fenced]);
    assert.strictEqual(result.repaired.length, 1);
    assert.strictEqual(result.repaired[0].name, 'Write');
  });

  it('returns error when all calls are unrepairable', () => {
    const result = repair.repair(['not json at all', 42]);
    assert.strictEqual(result.repaired.length, 0);
    assert.strictEqual(result.wasRepaired, true);
    assert.ok(result.error?.includes('unrepairable'));
  });

  it('repairs object with parameters alias', () => {
    const alias = [{ id: 'call_8', name: 'Read', parameters: { file_path: '/x' } }];
    const result = repair.repair(alias as unknown[]);
    assert.strictEqual(result.repaired.length, 1);
    assert.deepStrictEqual(result.repaired[0].arguments, { file_path: '/x' });
  });

  it('repairs object with input alias', () => {
    const alias = [{ id: 'call_9', name: 'Read', input: { file_path: '/y' } }];
    const result = repair.repair(alias as unknown[]);
    assert.strictEqual(result.repaired.length, 1);
    assert.deepStrictEqual(result.repaired[0].arguments, { file_path: '/y' });
  });

  it('repairs object with args alias', () => {
    const alias = [{ id: 'call_10', name: 'Read', args: { file_path: '/z' } }];
    const result = repair.repair(alias as unknown[]);
    assert.strictEqual(result.repaired.length, 1);
    assert.deepStrictEqual(result.repaired[0].arguments, { file_path: '/z' });
  });

  it('generates id when missing', () => {
    const noId = [{ name: 'Read', arguments: { file_path: '/a' } }];
    const result = repair.repair(noId as unknown[]);
    assert.strictEqual(result.repaired.length, 1);
    assert.ok(result.repaired[0].id);
    assert.ok(result.repaired[0].id.startsWith('call_repair_'));
  });

  it('skips repair when name is missing', () => {
    const noName = [{ id: 'call_x', arguments: {} }];
    const result = repair.repair(noName as unknown[]);
    assert.strictEqual(result.repaired.length, 0);
  });
});
