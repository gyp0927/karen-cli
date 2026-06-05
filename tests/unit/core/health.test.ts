import { describe, it } from 'node:test';
import assert from 'node:assert';
import { healthCheck } from '../../../src/core/health.js';

describe('healthCheck', () => {
  it('returns a health status with checks array', () => {
    const result = healthCheck();
    assert.strictEqual(typeof result.ok, 'boolean');
    assert.ok(Array.isArray(result.checks));
    assert.ok(result.checks.length >= 4);
  });

  it('includes API keys check', () => {
    const result = healthCheck();
    const apiCheck = result.checks.find(c => c.name === 'API keys');
    assert.ok(apiCheck);
    assert.strictEqual(typeof apiCheck.ok, 'boolean');
  });

  it('includes storage check', () => {
    const result = healthCheck();
    const storageCheck = result.checks.find(c => c.name === 'Storage');
    assert.ok(storageCheck);
    assert.strictEqual(storageCheck.ok, true); // Should always pass on test machine
  });

  it('includes Git check', () => {
    const result = healthCheck();
    const gitCheck = result.checks.find(c => c.name === 'Git');
    assert.ok(gitCheck);
    assert.strictEqual(typeof gitCheck.ok, 'boolean');
  });

  it('includes Node.js version check', () => {
    const result = healthCheck();
    const nodeCheck = result.checks.find(c => c.name === 'Node.js');
    assert.ok(nodeCheck);
    assert.strictEqual(nodeCheck.ok, true); // Test runs on Node >= 20
    assert.ok(nodeCheck.detail.includes(process.version));
  });

  it('includes MCP SDK check', () => {
    const result = healthCheck();
    const mcpCheck = result.checks.find(c => c.name === 'MCP SDK');
    assert.ok(mcpCheck);
    assert.strictEqual(typeof mcpCheck.ok, 'boolean');
  });

  it('ok is true only when all checks pass', () => {
    const result = healthCheck();
    const allOk = result.checks.every(c => c.ok);
    assert.strictEqual(result.ok, allOk);
  });

  it('each check has required fields', () => {
    const result = healthCheck();
    for (const check of result.checks) {
      assert.strictEqual(typeof check.name, 'string');
      assert.strictEqual(typeof check.ok, 'boolean');
      assert.strictEqual(typeof check.detail, 'string');
    }
  });
});
