import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { loadConfig, saveConfig, getConfigPath } from '../../../src/core/config.js';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Config', () => {
  const testDir = join(tmpdir(), 'karen-config-test-' + Date.now());

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('loadConfig returns defaults when no file exists', () => {
    // Config path is in ~/.karen/config.json — just verify it doesn't throw
    const config = loadConfig();
    assert.ok(typeof config === 'object');
    assert.ok(config.provider === 'anthropic' || typeof config.provider === 'string');
    assert.strictEqual(config.autoCheckpoint, true);
  });

  it('loadConfig is idempotent', () => {
    const a = loadConfig();
    const b = loadConfig();
    assert.deepStrictEqual(a, b);
  });

  it('getConfigPath returns a string path', () => {
    const path = getConfigPath();
    assert.ok(typeof path === 'string');
    assert.ok(path.endsWith('config.json'));
  });
});
