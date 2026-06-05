import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RepeatGuard } from '../../../src/core/repeat-guard.js';

describe('RepeatGuard', () => {
  it('allows first-time calls', () => {
    const guard = new RepeatGuard();
    const result = guard.check([{ id: '1', name: 'Read', arguments: { file_path: '/a' } }]);
    assert.strictEqual(result.isRepeat, false);
    assert.strictEqual(result.repeatCount, 0);
    assert.strictEqual(result.forceExit, false);
  });

  it('detects exact repeat after threshold', () => {
    const guard = new RepeatGuard({ maxRepeats: 2, forceExitThreshold: 4, windowSize: 10 });
    const call = { id: '1', name: 'Read', arguments: { file_path: '/a' } };

    guard.check([call]); // 1st — ok
    guard.check([call]); // 2nd — still ok (not > maxRepeats yet)
    const r3 = guard.check([call]); // 3rd — repeat count = 2

    assert.strictEqual(r3.isRepeat, true);
    assert.strictEqual(r3.repeatCount, 2);
    assert.strictEqual(r3.forceExit, false);
  });

  it('forces exit at forceExitThreshold', () => {
    const guard = new RepeatGuard({ maxRepeats: 2, forceExitThreshold: 4, windowSize: 10 });
    const call = { id: '1', name: 'Read', arguments: { file_path: '/a' } };

    for (let i = 0; i < 4; i++) guard.check([call]);
    const r5 = guard.check([call]);

    assert.strictEqual(r5.isRepeat, true);
    assert.strictEqual(r5.repeatCount, 4);
    assert.strictEqual(r5.forceExit, true);
    assert.ok(r5.warning);
  });

  it('handles undefined calls gracefully', () => {
    const guard = new RepeatGuard();
    const result = guard.check(undefined);
    assert.strictEqual(result.isRepeat, false);
    assert.strictEqual(result.repeatCount, 0);
  });

  it('handles empty calls', () => {
    const guard = new RepeatGuard();
    const result = guard.check([]);
    assert.strictEqual(result.isRepeat, false);
  });

  it('respects window size by trimming old entries', () => {
    const guard = new RepeatGuard({ maxRepeats: 2, forceExitThreshold: 4, windowSize: 3 });
    const call = { id: '1', name: 'Read', arguments: { file_path: '/a' } };

    guard.check([call]);
    guard.check([call]);
    guard.check([call]);
    // Window of 3 means first entry is still there... actually all 3 are
    const r4 = guard.check([call]);
    // After 4th check, history has 4 entries, trimmed to last 3
    // So repeat count = 3
    assert.strictEqual(r4.isRepeat, true);
    assert.strictEqual(r4.repeatCount, 3);
  });

  it('treats different args as different calls', () => {
    const guard = new RepeatGuard();
    guard.check([{ id: '1', name: 'Read', arguments: { file_path: '/a' } }]);
    const result = guard.check([{ id: '2', name: 'Read', arguments: { file_path: '/b' } }]);
    assert.strictEqual(result.isRepeat, false);
  });

  it('treats different tool names as different calls', () => {
    const guard = new RepeatGuard();
    guard.check([{ id: '1', name: 'Read', arguments: {} }]);
    const result = guard.check([{ id: '2', name: 'Write', arguments: {} }]);
    assert.strictEqual(result.isRepeat, false);
  });

  it('reset clears history', () => {
    const guard = new RepeatGuard();
    const call = { id: '1', name: 'Read', arguments: { file_path: '/a' } };

    for (let i = 0; i < 5; i++) guard.check([call]);
    guard.reset();

    const result = guard.check([call]);
    assert.strictEqual(result.isRepeat, false);
    assert.strictEqual(result.repeatCount, 0);
  });

  it('generates consistent fingerprints for sorted args', () => {
    const guard = new RepeatGuard();
    // Same args in different order should produce same fingerprint
    guard.check([{ id: '1', name: 'Read', arguments: { a: 1, b: 2 } }]);
    const result = guard.check([{ id: '2', name: 'Read', arguments: { b: 2, a: 1 } }]);
    assert.strictEqual(result.isRepeat, true);
    assert.strictEqual(result.repeatCount, 1);
  });
});
