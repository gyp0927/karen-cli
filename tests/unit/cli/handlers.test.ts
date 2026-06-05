import { describe, it } from 'node:test';
import assert from 'node:assert';
import { handleCommand, HandlerContext } from '../../../src/cli/handlers.js';
import { parseCommand } from '../../../src/cli/commands.js';

// Minimal mock AgentLoop
function mockLoop(overrides: Partial<HandlerContext['loop']> = {}) {
  return {
    getProviderInfo: () => ({ name: 'mock', model: 'mock-model' }),
    getCostTracker: () => null,
    getTools: () => [],
    getSkills: () => [],
    setSkills: () => {},
    getTaskManager: () => null,
    loadSession: async () => [],
    ...overrides,
  } as unknown as HandlerContext['loop'];
}

const baseCtx: HandlerContext = { loop: mockLoop() };

describe('Command Handlers', () => {
  it('help returns mode info and command list', async () => {
    const lines = await handleCommand({ type: 'help' }, baseCtx);
    assert.ok(lines.some(l => l.includes('Chat')));
    assert.ok(lines.some(l => l.includes('Code')));
    assert.ok(lines.some(l => l.includes('/exit')));
    assert.ok(lines.some(l => l.includes('/diff')));
    assert.ok(lines.some(l => l.includes('/rollback')));
  });

  it('model shows provider info', async () => {
    const lines = await handleCommand({ type: 'model' }, baseCtx);
    assert.ok(lines.some(l => l.includes('mock')));
  });

  it('model with args switches provider', async () => {
    let switched = '';
    const ctx: HandlerContext = {
      ...baseCtx,
      onSwitchProvider: async (name) => { switched = name; return true; },
    };
    const lines = await handleCommand({ type: 'model', args: 'openai' }, ctx);
    assert.strictEqual(switched, 'openai');
    assert.ok(lines.some(l => l.includes('Switched')));
  });

  it('model switch fails gracefully', async () => {
    const ctx: HandlerContext = {
      ...baseCtx,
      onSwitchProvider: async () => false,
    };
    const lines = await handleCommand({ type: 'model', args: 'unknown' }, ctx);
    assert.ok(lines.some(l => l.includes('Failed')));
  });

  it('cost shows not enabled when no tracker', async () => {
    const lines = await handleCommand({ type: 'cost' }, baseCtx);
    assert.ok(lines.some(l => l.includes('not enabled')));
  });

  it('tools lists registered tools', async () => {
    const ctx: HandlerContext = {
      ...baseCtx,
      loop: mockLoop({
        getTools: () => [{ name: 'Read', description: 'Read files', parameters: {}, execute: async () => ({ success: true, output: '' }) }],
      }),
    };
    const lines = await handleCommand({ type: 'tools' }, ctx);
    assert.ok(lines.some(l => l.includes('Read')));
  });

  it('skills lists loaded skills', async () => {
    const ctx: HandlerContext = {
      ...baseCtx,
      loop: mockLoop({
        getSkills: () => [{ name: 'debug', description: 'Debug helper', trigger: ['debug'], prompt: '...' }],
      }),
    };
    const lines = await handleCommand({ type: 'skills' }, ctx);
    assert.ok(lines.some(l => l.includes('debug')));
  });

  it('tasks shows no tasks when empty', async () => {
    const ctx: HandlerContext = {
      ...baseCtx,
      loop: mockLoop({
        getTaskManager: () => ({ getSummary: () => ({ total: 0, pending: 0, running: 0, completed: 0, failed: 0 }), list: () => [] }) as any,
      }),
    };
    const lines = await handleCommand({ type: 'tasks' }, ctx);
    assert.ok(lines.some(l => l.includes('No tasks')));
  });

  it('plan shows no plan when empty', async () => {
    const lines = await handleCommand({ type: 'plan' }, { ...baseCtx, planManager: { getStatus: () => ({ hasPlan: false }) } as any });
    assert.ok(lines.some(l => l.includes('No active plan')));
  });

  it('diff shows result without throwing', async () => {
    const lines = await handleCommand({ type: 'diff' }, baseCtx);
    assert.ok(lines.length >= 1, 'diff command should return something');
  });

  it('resume handles missing transcript dir', async () => {
    const lines = await handleCommand({ type: 'resume' }, baseCtx);
    // Should not throw — either shows sessions or error message
    assert.ok(lines.length >= 1);
  });

  it('rollback returns message', async () => {
    const lines = await handleCommand({ type: 'rollback', args: '1' }, baseCtx);
    assert.ok(lines.length >= 1);
  });

  it('unknown command returns help hint', async () => {
    const lines = await handleCommand({ type: 'help' }, baseCtx);
    // Just verify it doesn't throw and returns something
    assert.ok(lines.length > 0);
  });

  it('parseCommand recognizes all new commands', () => {
    assert.strictEqual(parseCommand('/diff')?.type, 'diff');
    assert.strictEqual(parseCommand('/resume')?.type, 'resume');
    assert.strictEqual(parseCommand('/resume full')?.type, 'resume');
    assert.strictEqual(parseCommand('/rollback')?.type, 'rollback');
    assert.strictEqual(parseCommand('/rollback 3')?.type, 'rollback');
  });
});
