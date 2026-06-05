import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BaseProvider } from '../../../src/providers/base.js';
import { Message, ToolDefinition, StreamChunk } from '../../../src/core/types.js';

// Minimal mock OpenAI client for testing streamChatOpenAICompatible
// Using `any` to avoid importing the real openai package in tests
/* eslint-disable @typescript-eslint/no-explicit-any */

class MockOpenAI {
  chat = {
    completions: {
      create: async () => {
        const chunks = [
          { choices: [{ delta: { content: 'Hello' } }] },
          { choices: [{ delta: { content: ' world' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ];
        let i = 0;
        return {
          [Symbol.asyncIterator]: async function* () {
            while (i < chunks.length) yield chunks[i++];
          },
        };
      },
    },
  };
}

class TestProvider extends BaseProvider {
  name = 'test';
  model = 'test-model';

  async chat(): Promise<{ content?: string }> {
    return { content: 'test' };
  }

  formatMessages(messages: Message[]) {
    return messages.map(m => ({ role: m.role, content: m.content }));
  }

  async *stream(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk, void, unknown> {
    yield* (this as any).streamChatOpenAICompatible(
      new MockOpenAI(),
      'test-model',
      this.formatMessages(messages),
      tools
    );
  }
}

describe('BaseProvider streamChatOpenAICompatible', () => {
  it('yields text chunks', async () => {
    const provider = new TestProvider();
    const messages: Message[] = [{ role: 'user', content: 'Hello' }];
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream(messages)) {
      chunks.push(chunk);
    }
    const textChunks = chunks.filter(c => c.type === 'text');
    assert.ok(textChunks.length >= 1);
    assert.ok(textChunks.some(c => c.content?.includes('Hello')));
  });

  it('yields usage chunk', async () => {
    const provider = new TestProvider();
    const messages: Message[] = [{ role: 'user', content: 'Test' }];
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream(messages)) {
      chunks.push(chunk);
    }
    const usageChunks = chunks.filter(c => c.type === 'usage');
    assert.ok(usageChunks.length >= 1);
    assert.ok(usageChunks.some(c => c.usage?.total === 15));
  });

  it('handles stream with tool calls', async () => {
    class ToolCallMockOpenAI {
      chat = {
        completions: {
          create: async () => {
            const chunks = [
              { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'Read' } }] } }] },
              { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"file_path":' } }] } }] },
              { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"/tmp/a.txt"}' } }] } }] },
              { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
            ];
            let i = 0;
            return {
              [Symbol.asyncIterator]: async function* () {
                while (i < chunks.length) yield chunks[i++];
              },
            };
          },
        },
      };
    }

    class ToolProvider extends BaseProvider {
      name = 'tool-test';
      model = 'm';
      async chat() { return { content: 'test' }; }

      async *stream(): AsyncGenerator<StreamChunk, void, unknown> {
        yield* (this as any).streamChatOpenAICompatible(
          new ToolCallMockOpenAI(),
          'm',
          []
        );
      }
    }

    const provider = new ToolProvider();
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream()) {
      chunks.push(chunk);
    }
    const toolChunks = chunks.filter(c => c.type === 'tool_calls');
    assert.ok(toolChunks.length >= 1);
    const tc = toolChunks[0].tool_calls?.[0];
    assert.ok(tc);
    assert.strictEqual(tc.name, 'Read');
    assert.deepStrictEqual(tc.arguments, { file_path: '/tmp/a.txt' });
  });

  it('emits fallback tool calls when stream ends without tool_calls finish_reason', async () => {
    class FallbackMockOpenAI {
      chat = {
        completions: {
          create: async () => {
            const chunks = [
              { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'Write' } }] } }] },
              { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"content":"hi"}' } }] } }] },
              { choices: [{ delta: {}, finish_reason: 'stop' }] },
            ];
            let i = 0;
            return {
              [Symbol.asyncIterator]: async function* () {
                while (i < chunks.length) yield chunks[i++];
              },
            };
          },
        },
      };
    }

    class FallbackProvider extends BaseProvider {
      name = 'fb-test';
      model = 'm';
      async chat() { return { content: 'test' }; }

      async *stream(): AsyncGenerator<StreamChunk, void, unknown> {
        yield* (this as any).streamChatOpenAICompatible(
          new FallbackMockOpenAI(),
          'm',
          []
        );
      }
    }

    const provider = new FallbackProvider();
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream()) {
      chunks.push(chunk);
    }
    const toolChunks = chunks.filter(c => c.type === 'tool_calls');
    assert.ok(toolChunks.length >= 1);
  });
});
