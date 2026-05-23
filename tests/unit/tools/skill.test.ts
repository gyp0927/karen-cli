import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createSkillTool } from '../../../src/tools/skill.js';
import { SkillManager } from '../../../src/skills/manager.js';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Skill tool', () => {
  let testDir: string;
  let manager: SkillManager;
  let changeCalled: boolean;

  beforeEach(() => {
    testDir = join(tmpdir(), `karen-skill-tool-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    manager = new SkillManager(testDir);
    changeCalled = false;
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should list skills', async () => {
    const tool = createSkillTool(manager, () => { changeCalled = true; });
    const result = await tool.execute({ operation: 'list' });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('No skills'));
    assert.strictEqual(changeCalled, false);
  });

  it('should install a skill from URL', async () => {
    const skillContent = `---
name: test-download
description: Downloaded test skill
trigger: [download]
---

Prompt here.
`;
    const tempFile = join(tmpdir(), `karen-test-${Date.now()}.md`);
    writeFileSync(tempFile, skillContent, 'utf8');
    const url = 'file://' + tempFile.replace(/\\/g, '/');

    const tool = createSkillTool(manager, () => { changeCalled = true; });
    const result = await tool.execute({ operation: 'install', url });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('test-download'));
    assert.strictEqual(changeCalled, true);

    try { rmSync(tempFile); } catch { /* ignore */ }
  });

  it('should require url for install', async () => {
    const tool = createSkillTool(manager);
    const result = await tool.execute({ operation: 'install' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Missing'));
  });

  it('should remove a skill', async () => {
    writeFileSync(join(testDir, 'remove-me.json'), JSON.stringify({
      name: 'remove-me',
      description: 'To remove',
      trigger: ['remove'],
      prompt: 'Remove me.',
    }));
    manager.reload();

    const tool = createSkillTool(manager, () => { changeCalled = true; });
    const result = await tool.execute({ operation: 'remove', name: 'remove-me' });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('Removed'));
    assert.strictEqual(changeCalled, true);
  });

  it('should require name for remove', async () => {
    const tool = createSkillTool(manager);
    const result = await tool.execute({ operation: 'remove' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Missing'));
  });

  it('should return error for unknown operation', async () => {
    const tool = createSkillTool(manager);
    const result = await tool.execute({ operation: 'fly' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Unknown'));
  });
});
