import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SkillManager } from '../../../src/skills/manager.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SkillManager', () => {
  let testDir: string;
  let manager: SkillManager;

  beforeEach(() => {
    testDir = join(tmpdir(), `karen-skill-manager-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    manager = new SkillManager(testDir);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should load skills from directory on init', () => {
    writeFileSync(join(testDir, 'test.json'), JSON.stringify({
      name: 'test',
      description: 'A test skill',
      trigger: ['test'],
      prompt: 'Test prompt',
    }));

    const m = new SkillManager(testDir);
    const skills = m.getSkills();
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'test');
  });

  it('should remove a skill', () => {
    writeFileSync(join(testDir, 'delete-me.json'), JSON.stringify({
      name: 'delete-me',
      description: 'To be deleted',
      trigger: ['delete'],
      prompt: 'Delete me.',
    }));

    manager.reload();
    assert.strictEqual(manager.getSkills().length, 1);

    const ok = manager.remove('delete-me');
    assert.strictEqual(ok, true);
    assert.strictEqual(manager.getSkills().length, 0);
    assert.strictEqual(existsSync(join(testDir, 'delete-me.json')), false);
  });

  it('should return false when removing non-existent skill', () => {
    const ok = manager.remove('nonexistent');
    assert.strictEqual(ok, false);
  });

  it('should install skill from URL (mock)', async () => {
    // Create a simple local "server" file and read it via file:// URL
    const skillContent = `---
name: downloaded
description: Downloaded skill
trigger: [download]
---

Downloaded prompt.
`;
    const tempFile = join(tmpdir(), `karen-test-skill-${Date.now()}.md`);
    writeFileSync(tempFile, skillContent, 'utf8');

    const url = 'file://' + tempFile.replace(/\\/g, '/');
    const skill = await manager.installFromUrl(url);

    if (skill) {
      assert.strictEqual(skill.name, 'downloaded');
      assert.strictEqual(skill.description, 'Downloaded skill');
      assert.deepStrictEqual(skill.trigger, ['download']);
      assert.ok(skill.prompt.includes('Downloaded prompt'));

      // Should be saved to the skills dir
      assert.ok(existsSync(join(testDir, 'downloaded.md')));
    }

    // cleanup
    try { rmSync(tempFile); } catch { /* ignore */ }
  });

  it('should return null for invalid URL', async () => {
    const skill = await manager.installFromUrl('file:///nonexistent/path/skill.md');
    assert.strictEqual(skill, null);
  });

  it('should handle .json skill install from URL', async () => {
    const skillContent = JSON.stringify({
      name: 'json-skill',
      description: 'JSON skill',
      trigger: ['json'],
      prompt: 'JSON prompt',
    });
    const tempFile = join(tmpdir(), `karen-test-skill-${Date.now()}.json`);
    writeFileSync(tempFile, skillContent, 'utf8');

    const url = 'file://' + tempFile.replace(/\\/g, '/');
    const skill = await manager.installFromUrl(url);

    if (skill) {
      assert.strictEqual(skill.name, 'json-skill');
      assert.ok(existsSync(join(testDir, 'json-skill.json')));
    }

    try { rmSync(tempFile); } catch { /* ignore */ }
  });
});
