import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createGitTool } from '../../../src/tools/git.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('Git tool', () => {
  let testDir: string;
  let tool: ReturnType<typeof createGitTool>;

  beforeEach(() => {
    testDir = join(tmpdir(), `karen-git-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    tool = createGitTool();

    // Initialize git repo with explicit branch name
    execSync('git init --initial-branch=main', { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should show status', async () => {
    writeFileSync(join(testDir, 'a.txt'), 'hello', 'utf8');

    const result = await tool.execute({ operation: 'status', path: testDir });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('a.txt'));
  });

  it('should show empty status', async () => {
    const result = await tool.execute({ operation: 'status', path: testDir });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('clean') || result.output === '' || result.output === 'Working tree clean');
  });

  it('should add and commit', async () => {
    writeFileSync(join(testDir, 'b.txt'), 'world', 'utf8');

    const add = await tool.execute({ operation: 'add', path: testDir, target: 'b.txt' });
    assert.strictEqual(add.success, true);

    const commit = await tool.execute({ operation: 'commit', path: testDir, message: 'Initial commit' });
    assert.strictEqual(commit.success, true);
    assert.ok(commit.output.includes('Initial commit') || commit.output.includes('1 file changed'));
  });

  it('should show log', async () => {
    writeFileSync(join(testDir, 'c.txt'), 'test', 'utf8');
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "first"', { cwd: testDir });

    const result = await tool.execute({ operation: 'log', path: testDir });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('first'));
  });

  it('should show branch list', async () => {
    // Git needs at least one commit for a branch to exist
    writeFileSync(join(testDir, 'd.txt'), 'branch-test', 'utf8');
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "branch-test"', { cwd: testDir });

    const result = await tool.execute({ operation: 'branch', path: testDir });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('main') || result.output.includes('master'));
  });

  it('should require message for commit', async () => {
    const result = await tool.execute({ operation: 'commit', path: testDir });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Missing'));
  });
});
