import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CostTracker } from '../../../src/core/cost.js';

describe('CostTracker', () => {
  it('should track session cost', () => {
    const ct = new CostTracker();
    ct.record('anthropic', 'claude-sonnet-4-6', { prompt: 1000, completion: 500, total: 1500 });
    const cost = ct.sessionCost();
    assert.ok(cost > 0, 'session cost should be positive');
    assert.ok(cost < 1, '1500 tokens should cost less than $1');
  });

  it('should track daily cost', () => {
    const ct = new CostTracker();
    ct.record('openai', 'gpt-4o', { prompt: 5000, completion: 2000, total: 7000 });
    const daily = ct.dailyCost();
    assert.ok(daily > 0);
  });

  it('should track total tokens', () => {
    const ct = new CostTracker();
    ct.record('anthropic', 'claude-sonnet-4-6', { prompt: 100, completion: 50, total: 150 });
    ct.record('anthropic', 'claude-sonnet-4-6', { prompt: 200, completion: 100, total: 300 });
    const tokens = ct.totalTokens();
    assert.strictEqual(tokens.total, 450);
    assert.strictEqual(tokens.prompt, 300);
    assert.strictEqual(tokens.completion, 150);
  });

  it('should check budget limits', () => {
    const ct = new CostTracker({ sessionUsd: 0.001, dailyUsd: 100 });
    // Within budget
    const check1 = ct.checkBudget('anthropic', 'claude-sonnet-4-6', { prompt: 10, completion: 5, total: 15 });
    assert.strictEqual(check1.allowed, true);

    // Exceed session budget
    ct.record('anthropic', 'claude-sonnet-4-6', { prompt: 500000, completion: 500000, total: 1000000 });
    const check2 = ct.checkBudget('anthropic', 'claude-sonnet-4-6', { prompt: 100, completion: 100, total: 200 });
    assert.strictEqual(check2.allowed, false);
    assert.ok(check2.reason?.includes('Session'));
  });

  it('should return summary string', () => {
    const ct = new CostTracker();
    ct.record('anthropic', 'claude-sonnet-4-6', { prompt: 1000, completion: 500, total: 1500 });
    const summary = ct.summary();
    assert.ok(summary.includes('Session'));
    assert.ok(summary.includes('Today'));
    assert.ok(summary.includes('Tokens'));
  });

  it('should handle unknown model pricing gracefully', () => {
    const ct = new CostTracker();
    ct.record('unknown', 'unknown-model', { prompt: 1000, completion: 500, total: 1500 });
    const cost = ct.sessionCost();
    assert.ok(cost >= 0, 'unknown model should not crash');
  });
});
