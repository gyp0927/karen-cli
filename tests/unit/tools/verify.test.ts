import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createVerifyTool } from '../../../src/tools/verify.js';

describe('Verify tool', () => {
  it('runs npm test and returns result', async () => {
    const tool = createVerifyTool();
    const result = await tool.execute({ cwd: process.cwd() });
    assert.strictEqual(typeof result.success, 'boolean');
    assert.ok(typeof result.output === 'string');
    assert.ok(result.output.length > 0);
  });

  it('handles missing command gracefully', async () => {
    const tool = createVerifyTool();
    const result = await tool.execute({ command: 'nonexistent_command_xyz', cwd: process.cwd() });
    assert.strictEqual(result.success, false);
  });

  it('has correct name and description', () => {
    const tool = createVerifyTool();
    assert.strictEqual(tool.name, 'Verify');
    assert.ok(tool.description.includes('test'));
  });
});
