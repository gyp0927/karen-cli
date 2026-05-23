import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SkillLoader } from '../../../src/skills/loader.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SkillLoader', () => {
  let testDir: string;
  let loader: SkillLoader;

  beforeEach(() => {
    testDir = join(tmpdir(), `karen-skills-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    loader = new SkillLoader();
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should load skills from directory', () => {
    writeFileSync(join(testDir, 'debug.json'), JSON.stringify({
      name: 'debug',
      description: 'Debug a failing test',
      trigger: ['debug', 'fix test'],
      prompt: 'Analyze the test failure and suggest fixes.',
    }));

    writeFileSync(join(testDir, 'refactor.json'), JSON.stringify({
      name: 'refactor',
      description: 'Refactor code',
      trigger: ['refactor', 'clean up'],
      prompt: 'Suggest refactoring improvements.',
    }));

    const skills = loader.loadFromDirectory(testDir);
    assert.strictEqual(skills.length, 2);
    assert.ok(skills.some(s => s.name === 'debug'));
    assert.ok(skills.some(s => s.name === 'refactor'));
  });

  it('should load a single skill from file', () => {
    const filePath = join(testDir, 'test.json');
    writeFileSync(filePath, JSON.stringify({
      name: 'test',
      description: 'Write tests',
      trigger: ['test', 'TDD'],
      prompt: 'Write comprehensive tests.',
    }));

    const skill = loader.loadFromFile(filePath);
    assert.ok(skill);
    assert.strictEqual(skill!.name, 'test');
    assert.deepStrictEqual(skill!.trigger, ['test', 'TDD']);
  });

  it('should return null for invalid skill file', () => {
    const filePath = join(testDir, 'bad.json');
    writeFileSync(filePath, 'not json');

    const skill = loader.loadFromFile(filePath);
    assert.strictEqual(skill, null);
  });

  it('should find skills by trigger keyword', () => {
    loader.loadFromDirectory(testDir);
    writeFileSync(join(testDir, 'a.json'), JSON.stringify({
      name: 'a',
      description: 'A',
      trigger: ['error', 'bug'],
      prompt: 'Fix it.',
    }));
    loader.loadFromDirectory(testDir);

    const matches = loader.findByTrigger('there is a bug here');
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].name, 'a');
  });

  it('should get all loaded skills', () => {
    writeFileSync(join(testDir, 's1.json'), JSON.stringify({
      name: 's1', description: 'S1', trigger: ['a'], prompt: 'P1',
    }));
    writeFileSync(join(testDir, 's2.json'), JSON.stringify({
      name: 's2', description: 'S2', trigger: ['b'], prompt: 'P2',
    }));

    loader.loadFromDirectory(testDir);
    const all = loader.getAll();
    assert.strictEqual(all.length, 2);
  });

  it('should return empty for non-existent directory', () => {
    const skills = loader.loadFromDirectory(join(testDir, 'nonexistent'));
    assert.strictEqual(skills.length, 0);
  });

  it('should ignore non-JSON and non-MD files', () => {
    writeFileSync(join(testDir, 'readme.md'), '# Skills');
    writeFileSync(join(testDir, 'script.js'), 'console.log("no")');
    writeFileSync(join(testDir, 'valid.json'), JSON.stringify({
      name: 'valid', description: 'V', trigger: ['v'], prompt: 'P',
    }));

    const skills = loader.loadFromDirectory(testDir);
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'valid');
  });

  describe('Markdown skill support', () => {
    it('should load a .md skill with YAML frontmatter', () => {
      const md = `---
name: debug
description: Debug a failing test
trigger: [debug, fix test]
version: 1.0.0
author: karen
---

## Process

1. Reproduce the bug first
2. Identify the minimal failing case
3. Check logs and error traces
`;
      writeFileSync(join(testDir, 'debug.md'), md);

      const skill = loader.loadFromFile(join(testDir, 'debug.md'));
      assert.ok(skill);
      assert.strictEqual(skill!.name, 'debug');
      assert.strictEqual(skill!.description, 'Debug a failing test');
      assert.deepStrictEqual(skill!.trigger, ['debug', 'fix test']);
      assert.ok(skill!.prompt.includes('Reproduce the bug'));
      assert.strictEqual(skill!.version, '1.0.0');
      assert.strictEqual(skill!.author, 'karen');
    });

    it('should load a .md skill with block array syntax', () => {
      const md = `---
name: refactor
description: Refactor code
trigger:
  - refactor
  - clean up
  - improve
---

Always suggest modern best practices. Focus on readability and performance.
`;
      writeFileSync(join(testDir, 'refactor.md'), md);

      const skill = loader.loadFromFile(join(testDir, 'refactor.md'));
      assert.ok(skill);
      assert.deepStrictEqual(skill!.trigger, ['refactor', 'clean up', 'improve']);
      assert.ok(skill!.prompt.includes('readability'));
    });

    it('should load .md and .json skills from the same directory', () => {
      writeFileSync(join(testDir, 'json-skill.json'), JSON.stringify({
        name: 'json-skill',
        description: 'From JSON',
        trigger: ['json'],
        prompt: 'JSON prompt',
      }));

      const md = `---
name: md-skill
description: From Markdown
trigger: [md]
---

Markdown prompt.
`;
      writeFileSync(join(testDir, 'md-skill.md'), md);

      const skills = loader.loadFromDirectory(testDir);
      assert.strictEqual(skills.length, 2);
      assert.ok(skills.some(s => s.name === 'json-skill'));
      assert.ok(skills.some(s => s.name === 'md-skill'));
    });

    it('should return null for markdown without required fields', () => {
      const md = `---
name: incomplete
description: Missing trigger and prompt
---

Some body text.
`;
      writeFileSync(join(testDir, 'incomplete.md'), md);

      const skill = loader.loadFromFile(join(testDir, 'incomplete.md'));
      assert.strictEqual(skill, null);
    });

    it('should handle comma-separated trigger string', () => {
      const md = `---
name: test-skill
description: Test
trigger: test, TDD, unit test
---

Test prompt.
`;
      writeFileSync(join(testDir, 'test.md'), md);

      const skill = loader.loadFromFile(join(testDir, 'test.md'));
      assert.ok(skill);
      assert.deepStrictEqual(skill!.trigger, ['test', 'TDD', 'unit test']);
    });

    it('should handle JSON frontmatter in markdown', () => {
      const md = `---
{
  "name": "json-frontmatter",
  "description": "Using JSON frontmatter",
  "trigger": ["json"]
}
---

Prompt here.
`;
      writeFileSync(join(testDir, 'json-frontmatter.md'), md);

      const skill = loader.loadFromFile(join(testDir, 'json-frontmatter.md'));
      assert.ok(skill);
      assert.strictEqual(skill!.name, 'json-frontmatter');
    });
  });
});
