import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildSystemPrompt } from '../../../src/core/prompt.js';

describe('buildSystemPrompt', () => {
  it('returns a string with cwd and tool list', async () => {
    const prompt = await buildSystemPrompt({
      cwd: '/test/project',
      toolList: '- Read: read files\n- Write: write files',
      skillPrompts: '',
    });
    assert.ok(prompt.includes('/test/project'));
    assert.ok(prompt.includes('Read: read files'));
    assert.ok(prompt.includes('Write: write files'));
  });

  it('includes provider-specific hints for deepseek', async () => {
    const prompt = await buildSystemPrompt({
      cwd: '/test',
      toolList: '',
      skillPrompts: '',
      provider: 'siliconflow',
    });
    assert.ok(prompt.includes('DeepSeek mode') || prompt.includes('Call tools FIRST'));
  });

  it('does not include extra hints for anthropic', async () => {
    const prompt = await buildSystemPrompt({
      cwd: '/test',
      toolList: '',
      skillPrompts: '',
      provider: 'anthropic',
    });
    // Anthropic should not have the deepseek prefix
    assert.ok(!prompt.includes('DeepSeek mode'));
  });

  it('includes date and time', async () => {
    const prompt = await buildSystemPrompt({
      cwd: '/test',
      toolList: '',
      skillPrompts: '',
    });
    assert.ok(prompt.includes('TODAY'));
    assert.ok(prompt.includes('DATE AND TIME'));
  });

  it('includes project hints when in a project', async () => {
    const prompt = await buildSystemPrompt({
      cwd: process.cwd(),
      toolList: '',
      skillPrompts: '',
    });
    // Should detect this TypeScript project
    assert.ok(prompt.includes('TypeScript') || prompt.includes('JavaScript') || prompt.includes('language'));
  });
});
