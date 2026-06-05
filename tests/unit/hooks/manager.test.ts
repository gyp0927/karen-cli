import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { HookManager } from '../../../src/hooks/manager.js';

describe('HookManager', () => {
  let manager: HookManager;

  beforeEach(() => {
    manager = new HookManager();
  });

  it('should register and trigger a hook', async () => {
    let called = false;
    manager.register('pre-message', () => {
      called = true;
    });

    await manager.trigger('pre-message', {});
    assert.strictEqual(called, true);
  });

  it('should pass context to hook callbacks', async () => {
    let receivedContext: Record<string, unknown> | null = null;
    manager.register('post-tool', (ctx) => {
      receivedContext = ctx;
    });

    await manager.trigger('post-tool', { toolName: 'Read', result: 'ok' });
    assert.ok(receivedContext);
    assert.strictEqual((receivedContext as Record<string, unknown>).toolName, 'Read');
  });

  it('should call multiple hooks in registration order', async () => {
    const order: number[] = [];
    manager.register('pre-message', () => { order.push(1); });
    manager.register('pre-message', () => { order.push(2); });
    manager.register('pre-message', () => { order.push(3); });

    await manager.trigger('pre-message', {});
    assert.deepStrictEqual(order, [1, 2, 3]);
  });

  it('should support async hooks', async () => {
    let value = 0;
    manager.register('pre-message', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      value = 42;
    });

    await manager.trigger('pre-message', {});
    assert.strictEqual(value, 42);
  });

  it('should unregister a hook', async () => {
    let count = 0;
    const callback = () => { count++; };
    manager.register('pre-message', callback);
    manager.unregister('pre-message', callback);

    await manager.trigger('pre-message', {});
    assert.strictEqual(count, 0);
  });

  it('should not throw if triggering unregistered hook', async () => {
    await manager.trigger('pre-exit', {});
    assert.ok(true);
  });

  it('should allow multiple hook types independently', async () => {
    let preMsg = false;
    let postTool = false;

    manager.register('pre-message', () => { preMsg = true; });
    manager.register('post-tool', () => { postTool = true; });

    await manager.trigger('pre-message', {});
    assert.strictEqual(preMsg, true);
    assert.strictEqual(postTool, false);

    await manager.trigger('post-tool', {});
    assert.strictEqual(postTool, true);
  });

  it('should continue calling hooks even if one throws', async () => {
    let secondCalled = false;
    manager.register('pre-message', () => {
      throw new Error('first hook failed');
    });
    manager.register('pre-message', () => {
      secondCalled = true;
    });

    await manager.trigger('pre-message', {});
    assert.strictEqual(secondCalled, true);
  });

  it('should collect errors from failed hooks', async () => {
    manager.register('pre-message', () => {
      throw new Error('hook 1 failed');
    });
    manager.register('pre-message', () => {
      throw new Error('hook 2 failed');
    });

    const errors = await manager.trigger('pre-message', {});
    assert.strictEqual(errors.length, 2);
    assert.ok(errors.some(e => e instanceof Error && e.message.includes('hook 1 failed')));
    assert.ok(errors.some(e => e instanceof Error && e.message.includes('hook 2 failed')));
  });
});
