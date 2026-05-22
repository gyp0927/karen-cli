import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OpenAIProvider } from '../../../src/providers/openai.js';

describe('OpenAIProvider', () => {
  it('should have correct name', () => {
    const provider = new OpenAIProvider('test-key');
    assert.strictEqual(provider.name, 'openai');
  });

  it('should format messages correctly', () => {
    const provider = new OpenAIProvider('test-key');
    const formatted = provider.formatMessages([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);
    assert.strictEqual(formatted.length, 2);
    assert.strictEqual(formatted[0].role, 'user');
    assert.strictEqual(formatted[0].content, 'Hello');
  });
});