import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SiliconFlowProvider } from '../../../src/providers/siliconflow.js';

describe('SiliconFlowProvider', () => {
  it('should have correct name', () => {
    const provider = new SiliconFlowProvider('test-key');
    assert.strictEqual(provider.name, 'siliconflow');
  });

  it('should format messages correctly', () => {
    const provider = new SiliconFlowProvider('test-key');
    const formatted = provider.formatMessages([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);
    assert.strictEqual(formatted.length, 2);
    assert.strictEqual(formatted[0].role, 'user');
    assert.strictEqual(formatted[0].content, 'Hello');
  });
});
