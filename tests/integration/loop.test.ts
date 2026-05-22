import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AgentLoop } from '../../src/core/loop.js';
import { IProvider, Message, Tool, ProviderResponse } from '../../src/core/types.js';

class MockProvider implements IProvider {
  name = 'mock';
  readonly model = 'mock-model';
  private responses: ProviderResponse[];
  private callCount = 0;

  constructor(responses: ProviderResponse[]) {
    this.responses = responses;
  }

  async chat(): Promise<ProviderResponse> {
    return this.responses[this.callCount++] || { content: 'done' };
  }
}

describe('AgentLoop', () => {
  it('should handle simple text response', async () => {
    const provider = new MockProvider([
      { content: 'Hello there' },
    ]);
    const loop = new AgentLoop({ provider, tools: [] });
    const result = await loop.run('Say hi');
    assert.strictEqual(result, 'Hello there');
  });

  it('should execute tool call and return result', async () => {
    let toolExecuted = false;
    const mockTool: Tool = {
      name: 'TestTool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      async execute() {
        toolExecuted = true;
        return { success: true, output: 'tool result' };
      },
    };

    const provider = new MockProvider([
      {
        tool_calls: [{
          id: 'call_1',
          name: 'TestTool',
          arguments: {},
        }],
      },
      { content: 'Done with tool' },
    ]);

    const loop = new AgentLoop({ provider, tools: [mockTool] });
    const result = await loop.run('Use tool');
    assert.strictEqual(toolExecuted, true);
    assert.strictEqual(result, 'Done with tool');
  });

  it('should respect max iterations', async () => {
    const provider = new MockProvider([
      { tool_calls: [{ id: '1', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '2', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '3', name: 'TestTool', arguments: {} }] },
    ]);

    const mockTool: Tool = {
      name: 'TestTool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: true, output: 'ok' };
      },
    };

    const loop = new AgentLoop({ provider, tools: [mockTool], maxIterations: 2 });
    const result = await loop.run('Loop test');
    assert.ok(result.includes('max') || result.includes('limit') || result.includes('iteration'));
  });
});
