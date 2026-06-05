import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MODES, MODE_ORDER, KarenMode } from '../../../src/core/modes.js';

describe('Modes', () => {
  it('has all 4 modes defined', () => {
    assert.strictEqual(MODE_ORDER.length, 4);
    assert.ok(MODES.chat);
    assert.ok(MODES.code);
    assert.ok(MODES.agent);
    assert.ok(MODES.plan);
  });

  it('each mode has name, emoji, description, behaviorPrompt', () => {
    for (const key of MODE_ORDER) {
      const m = MODES[key];
      assert.ok(m.name.length > 0);
      assert.ok(m.emoji.length > 0);
      assert.ok(m.description.length > 0);
      assert.ok(m.behaviorPrompt.length > 50);
    }
  });

  it('chat mode restricts file changes', () => {
    const p = MODES.chat.behaviorPrompt;
    assert.ok(p.includes('Do NOT modify files'));
  });

  it('code mode allows full access', () => {
    const p = MODES.code.behaviorPrompt;
    assert.ok(p.includes('full access'));
    assert.ok(p.includes('Verify tool'));
  });

  it('agent mode is autonomous', () => {
    const p = MODES.agent.behaviorPrompt;
    assert.ok(p.includes('autonomously') || p.includes('keep going'));
    assert.ok(p.includes('Verify'));
  });

  it('plan mode requires approval', () => {
    const p = MODES.plan.behaviorPrompt;
    assert.ok(p.includes('plan'));
    assert.ok(p.includes('approval') || p.includes('approved'));
  });
});
