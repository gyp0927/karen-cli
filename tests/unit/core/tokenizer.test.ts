import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LocalTokenizer } from '../../../src/core/tokenizer.js';

describe('LocalTokenizer', () => {
  const tokenizer = new LocalTokenizer();

  it('estimates ASCII text tokens', () => {
    const result = tokenizer.estimate('Hello world');
    assert.strictEqual(result.chars, 11);
    assert.ok(result.tokens >= 3); // ceil(11/4) = 3
  });

  it('uses fast path for pure ASCII', () => {
    const ascii = 'The quick brown fox jumps over the lazy dog.';
    const result = tokenizer.estimate(ascii);
    assert.strictEqual(result.chars, ascii.length);
    assert.strictEqual(result.tokens, Math.ceil(ascii.length / 4));
  });

  it('estimates CJK characters with higher token count', () => {
    const cjk = '你好世界'; // 4 CJK chars
    const result = tokenizer.estimate(cjk);
    assert.strictEqual(result.chars, 4);
    assert.ok(result.tokens >= 6); // 4 * 1.5 = 6
  });

  it('estimates mixed ASCII and CJK', () => {
    const mixed = 'Hello 你好 world 世界';
    const result = tokenizer.estimate(mixed);
    assert.strictEqual(result.chars, mixed.length);
    assert.ok(result.tokens > 0);
  });

  it('handles empty string', () => {
    const result = tokenizer.estimate('');
    assert.strictEqual(result.chars, 0);
    assert.strictEqual(result.tokens, 0);
  });

  it('handles whitespace with low token cost', () => {
    const spaces = '    ';
    const result = tokenizer.estimate(spaces);
    assert.strictEqual(result.chars, 4);
    assert.strictEqual(result.tokens, 1); // ceil(4 * 0.25) = 1
  });

  it('handles punctuation', () => {
    const punct = '!!!???';
    const result = tokenizer.estimate(punct);
    assert.strictEqual(result.chars, 6);
    // Pure ASCII goes through fast path: ceil(6 / 4) = 2
    assert.strictEqual(result.tokens, 2);
  });

  it('handles Korean characters', () => {
    const korean = '안녕하세요'; // 5 Korean chars
    const result = tokenizer.estimate(korean);
    assert.strictEqual(result.chars, 5);
    assert.ok(result.tokens >= 8); // 5 * 1.5 = 7.5 → ceil = 8
  });

  it('handles Japanese hiragana', () => {
    const hiragana = 'こんにちは'; // 5 hiragana
    const result = tokenizer.estimate(hiragana);
    assert.strictEqual(result.chars, 5);
    assert.ok(result.tokens >= 8);
  });

  it('estimates message arrays with overhead', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    const result = tokenizer.estimateMessages(messages);
    assert.strictEqual(result.chars, 8);
    // Each message gets +4 overhead: ceil(5/4) + 4 + ceil(3/4) + 4 = 2 + 4 + 1 + 4 = 11
    assert.ok(result.tokens >= 11);
  });

  it('handles empty message array', () => {
    const result = tokenizer.estimateMessages([]);
    assert.strictEqual(result.chars, 0);
    assert.strictEqual(result.tokens, 0);
  });

  it('handles emoji (non-ASCII, non-CJK)', () => {
    const emoji = '🎉🎊'; // 2 emoji code points
    const result = tokenizer.estimate(emoji);
    // In JS, emoji are surrogate pairs: '🎉🎊'.length === 4
    assert.strictEqual(result.chars, 4);
    // Emoji codepoints are > 127 but not in CJK ranges → 2 code points * 2 = 4
    assert.ok(result.tokens >= 4);
  });
});
