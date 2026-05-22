import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PermissionManager } from '../../../src/permissions/manager.js';

describe('PermissionManager', () => {
  it('should allow non-sensitive tools without asking', async () => {
    const pm = new PermissionManager();
    const allowed = await pm.check('Read', { file_path: '/test.txt' });
    assert.strictEqual(allowed, true);
  });

  it('should require confirmation for Bash tool', async () => {
    let called = false;
    const pm = new PermissionManager({
      confirm: async () => { called = true; return true; },
    });
    const allowed = await pm.check('Bash', { command: 'echo hi' });
    assert.strictEqual(allowed, true);
    assert.strictEqual(called, true);
  });

  it('should deny if user rejects', async () => {
    const pm = new PermissionManager({
      confirm: async () => false,
    });
    const allowed = await pm.check('Bash', { command: 'echo hi' });
    assert.strictEqual(allowed, false);
  });
});
