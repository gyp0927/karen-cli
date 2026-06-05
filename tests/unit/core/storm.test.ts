import { describe, it } from 'node:test';
import assert from 'node:assert';
import { StormBreaker } from '../../../src/core/storm.js';

describe('StormBreaker', () => {
  it('should execute successfully on first try', async () => {
    const sb = new StormBreaker({ maxRetries: 2 });
    const result = await sb.execute('test', async () => 'ok');
    assert.strictEqual(result, 'ok');
  });

  it('should retry on transient error and succeed', async () => {
    let attempts = 0;
    const sb = new StormBreaker({ maxRetries: 3, baseDelayMs: 10 });
    const result = await sb.execute('test', async () => {
      attempts++;
      if (attempts < 2) throw new Error('ECONNRESET');
      return 'recovered';
    });
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(attempts, 2);
  });

  it('should fail after max retries', async () => {
    const sb = new StormBreaker({ maxRetries: 2, baseDelayMs: 10 });
    try {
      await sb.execute('test', async () => { throw new Error('ECONNRESET'); });
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err instanceof Error);
    }
  });

  it('should not retry non-transient errors', async () => {
    let attempts = 0;
    const sb = new StormBreaker({ maxRetries: 3, baseDelayMs: 10 });
    try {
      await sb.execute('test', async () => {
        attempts++;
        throw new Error('Some permanent error');
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.strictEqual(attempts, 1, 'should not retry permanent errors');
    }
  });

  it('should open circuit after threshold failures', async () => {
    const sb = new StormBreaker({ maxRetries: 1, circuitThreshold: 2, baseDelayMs: 10 });
    // Fail twice to open circuit
    for (let i = 0; i < 2; i++) {
      try { await sb.execute('test', async () => { throw new Error('timeout'); }); } catch {}
    }
    // Third call should throw circuit breaker error
    try {
      await sb.execute('test', async () => 'ok');
      assert.fail('should have thrown circuit breaker error');
    } catch (err) {
      assert.ok((err as Error).message.includes('Circuit breaker'));
    }
  });

  it('should handle timeout', async () => {
    const sb = new StormBreaker({ requestTimeoutMs: 50, maxRetries: 1, baseDelayMs: 10 });
    try {
      await sb.execute('test', () => new Promise(r => setTimeout(r, 200)));
      assert.fail('should have thrown timeout');
    } catch (err) {
      assert.ok((err as Error).message.includes('timed out'));
    }
  });
});
