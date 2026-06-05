import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PrefixCache } from '../../../src/core/prefix-cache.js';
import { Message, ToolDefinition } from '../../../src/core/types.js';

describe('PrefixCache', () => {
  it('builds prefix with system message', () => {
    const cache = new PrefixCache();
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    const result = cache.build(messages, 'You are a helpful assistant.');
    assert.strictEqual(result.prefix.length, 1);
    assert.strictEqual(result.prefix[0].role, 'system');
    assert.strictEqual(result.dynamic.length, 2);
  });

  it('builds empty prefix when no system message', () => {
    const cache = new PrefixCache();
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];

    const result = cache.build(messages, 'sys');
    assert.strictEqual(result.prefix.length, 0);
    assert.strictEqual(result.dynamic.length, 2);
  });

  it('detects unchanged prefix', () => {
    const cache = new PrefixCache();
    const messages: Message[] = [
      { role: 'system', content: 'Sys' },
      { role: 'user', content: 'Hello' },
    ];

    const r1 = cache.build(messages, 'Sys');
    assert.strictEqual(cache.isPrefixUnchanged(r1.hash), true);
  });

  it('detects changed prefix', () => {
    const cache = new PrefixCache();
    const messages1: Message[] = [
      { role: 'system', content: 'Sys v1' },
      { role: 'user', content: 'Hello' },
    ];
    const messages2: Message[] = [
      { role: 'system', content: 'Sys v2' },
      { role: 'user', content: 'Hello' },
    ];

    const r1 = cache.build(messages1, 'Sys v1');
    cache.build(messages2, 'Sys v2'); // updates lastPrefixHash
    assert.strictEqual(cache.isPrefixUnchanged(r1.hash), false);
  });

  it('includes tools in hash', () => {
    const cache = new PrefixCache();
    const messages: Message[] = [
      { role: 'system', content: 'Sys' },
    ];
    const tools: ToolDefinition[] = [{ name: 'Read', description: 'Read a file', parameters: { type: 'object', properties: {} } }];

    const r1 = cache.build(messages, 'Sys', tools);
    const r2 = cache.build(messages, 'Sys'); // no tools
    assert.notStrictEqual(r1.hash, r2.hash);
  });

  it('produces stable hash for same input', () => {
    const cache1 = new PrefixCache();
    const cache2 = new PrefixCache();
    const messages: Message[] = [
      { role: 'system', content: 'Same' },
      { role: 'user', content: 'Q' },
    ];

    const r1 = cache1.build(messages, 'Same');
    const r2 = cache2.build(messages, 'Same');
    assert.strictEqual(r1.hash, r2.hash);
  });

  it('produces different hashes for different system prompts', () => {
    const cache = new PrefixCache();
    const messages: Message[] = [{ role: 'system', content: 'A' }];

    const r1 = cache.build(messages, 'A');
    const r2 = cache.build([{ role: 'system', content: 'B' }], 'B');
    assert.notStrictEqual(r1.hash, r2.hash);
  });
});
