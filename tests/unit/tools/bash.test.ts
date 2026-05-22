import assert from 'node:assert';
import { test, describe } from 'node:test';
import { createBashTool } from '../../../src/tools/bash.js';

describe('Bash tool', () => {
  test('executes echo hello and output contains hello', async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: 'echo hello' });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('hello'));
  });

  test('fails for invalid command', async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: 'this_command_does_not_exist_12345' });
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});
