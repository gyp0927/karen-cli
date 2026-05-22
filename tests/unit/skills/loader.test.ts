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

  it('should ignore non-JSON files', () => {
    writeFileSync(join(testDir, 'readme.md'), '# Skills');
    writeFileSync(join(testDir, 'valid.json'), JSON.stringify({
      name: 'valid', description: 'V', trigger: ['v'], prompt: 'P',
    }));

    const skills = loader.loadFromDirectory(testDir);
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'valid');
  });
});
