import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DeepSeekProvider } from '../../../src/providers/deepseek.js';
import { Message } from '../../../src/core/types.js';

describe('DeepSeekProvider', () => {
  it('constructs with default model', () => {
    const provider = new DeepSeekProvider('test-key');
    assert.strictEqual(provider.name, 'deepseek');
    assert.strictEqual(provider.model, 'deepseek-chat');
  });

  it('constructs with custom model', () => {
    const provider = new DeepSeekProvider('test-key', 'deepseek-reasoner');
    assert.strictEqual(provider.model, 'deepseek-reasoner');
  });

  it('formats simple user/assistant messages', () => {
    const provider = new DeepSeekProvider('test-key');
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    const formatted = provider.formatMessages(messages);
    assert.strictEqual(formatted.length, 2);
    assert.deepStrictEqual(formatted[0], { role: 'user', content: 'Hello' });
    assert.deepStrictEqual(formatted[1], { role: 'assistant', content: 'Hi!' });
  });

  it('formats system message', () => {
    const provider = new DeepSeekProvider('test-key');
    const messages: Message[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Q' },
    ];
    const formatted = provider.formatMessages(messages);
    assert.strictEqual(formatted[0].role, 'system');
    assert.strictEqual(formatted[0].content, 'You are helpful.');
  });

  it('formats tool role message', () => {
    const provider = new DeepSeekProvider('test-key');
    const messages: Message[] = [
      { role: 'tool', content: 'Result: 42', tool_call_id: 'call_1' },
    ];
    const formatted = provider.formatMessages(messages);
    assert.strictEqual(formatted[0].role, 'tool');
    assert.strictEqual((formatted[0] as unknown as Record<string, unknown>).tool_call_id, 'call_1');
  });

  it('formats assistant with tool_calls', () => {
    const provider = new DeepSeekProvider('test-key');
    const messages: Message[] = [
      {
        role: 'assistant',
        content: 'Let me check',
        tool_calls: [
          { id: 'call_1', name: 'Read', arguments: { file_path: '/a' } },
        ],
      },
    ];
    const formatted = provider.formatMessages(messages);
    const assistantMsg = formatted[0] as unknown as Record<string, unknown>;
    assert.strictEqual(assistantMsg.role, 'assistant');
    assert.ok(Array.isArray(assistantMsg.tool_calls));
    const tc = (assistantMsg.tool_calls as Array<Record<string, unknown>>)[0];
    assert.strictEqual(tc.id, 'call_1');
    assert.strictEqual(tc.type, 'function');
    assert.strictEqual((tc.function as Record<string, unknown>).name, 'Read');
    // Arguments are JSON-stringified
    assert.strictEqual(typeof (tc.function as Record<string, unknown>).arguments, 'string');
  });
});
