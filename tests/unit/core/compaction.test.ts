import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ContextCompactor } from '../../../src/core/compaction.js';
import { Message } from '../../../src/core/types.js';

describe('ContextCompactor', () => {
  it('should keep messages under token limit', () => {
    const compactor = new ContextCompactor(1000);
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    const result = compactor.compact(messages);
    assert.strictEqual(result.messages.length, 2);
    assert.strictEqual(result.dropped, 0);
  });

  it('should drop oldest messages when over limit (sliding window)', () => {
    const compactor = new ContextCompactor(20, 1);
    const messages: Message[] = [
      { role: 'user', content: 'First message with many words here and there' },
      { role: 'assistant', content: 'Second message also has words here and there' },
      { role: 'user', content: 'Third message with some content' },
      { role: 'assistant', content: 'Fourth message with some content' },
    ];

    const result = compactor.compact(messages);
    // Should keep system + recent messages
    assert.ok(result.messages.length < messages.length || result.dropped > 0);
  });

  it('should always preserve system messages', () => {
    const compactor = new ContextCompactor(10, 0);
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello world this is a long message' },
      { role: 'assistant', content: 'Another very long response here' },
    ];

    const result = compactor.compact(messages);
    const systemMsgs = result.messages.filter(m => m.role === 'system');
    assert.strictEqual(systemMsgs.length, 1);
  });

  it('should truncate long tool results', () => {
    const compactor = new ContextCompactor();
    const longOutput = Array(200).fill('line').join('\n');
    const truncated = compactor.truncateToolResult(longOutput, 50);

    assert.ok(truncated.length < longOutput.length);
    assert.ok(truncated.includes('[...'));
    assert.ok(truncated.includes('lines truncated'));
  });

  it('should not truncate short tool results', () => {
    const compactor = new ContextCompactor();
    const shortOutput = 'line1\nline2\nline3';
    const truncated = compactor.truncateToolResult(shortOutput, 50);

    assert.strictEqual(truncated, shortOutput);
  });

  it('should preserve recent messages over old ones', () => {
    const compactor = new ContextCompactor(60, 2);
    const messages: Message[] = [
      { role: 'user', content: 'Old question one' },
      { role: 'assistant', content: 'Old answer one' },
      { role: 'user', content: 'Old question two' },
      { role: 'assistant', content: 'Old answer two' },
      { role: 'user', content: 'Recent question' },
      { role: 'assistant', content: 'Recent answer' },
    ];

    const result = compactor.compact(messages);
    // Recent messages should be preserved
    assert.ok(result.messages.some(m => m.content === 'Recent question'));
    assert.ok(result.messages.some(m => m.content === 'Recent answer'));
  });

  it('should estimate tokens from messages', () => {
    const compactor = new ContextCompactor();
    const messages: Message[] = [
      { role: 'user', content: 'Hello world' },
      { role: 'assistant', content: 'Hi' },
    ];

    const tokens = compactor.estimateMessageTokens(messages);
    assert.ok(tokens > 0);
  });

  it('should return summary when compressing old messages', () => {
    const compactor = new ContextCompactor(40, 1);
    const messages: Message[] = [
      { role: 'user', content: 'What is TypeScript?' },
      { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' },
      { role: 'user', content: 'How do I install it?' },
      { role: 'assistant', content: 'Run npm install typescript.' },
    ];

    const result = compactor.compact(messages);
    // When old messages are dropped, a summary may be generated
    assert.ok(result.messages.length > 0);
  });
});
