import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AnthropicProvider } from '../../../src/providers/anthropic.js';

describe('AnthropicProvider', () => {
  it('should have correct name', () => {
    const provider = new AnthropicProvider('test-key');
    assert.strictEqual(provider.name, 'anthropic');
  });

  it('should format messages correctly', () => {
    const provider = new AnthropicProvider('test-key');
    const formatted = provider.formatMessages([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);
    assert.strictEqual(formatted.length, 2);
    assert.strictEqual(formatted[0].role, 'user');
    assert.strictEqual(formatted[0].content, 'Hello');
  });
});