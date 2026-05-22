import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAgentTool } from '../../../src/tools/agent.js';
import { IProvider, ProviderResponse, Tool } from '../../../src/core/types.js';

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

describe('Agent tool', () => {
  it('should delegate a task and return result', async () => {
    const provider = new MockProvider([
      { content: 'Sub-task completed successfully' },
    ]);

    const tool = createAgentTool(provider, []);
    const result = await tool.execute({ task: 'Fix the bug in utils.js' });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('completed'));
  });

  it('should execute sub-tools during delegation', async () => {
    let subToolExecuted = false;
    const mockTool: Tool = {
      name: 'TestTool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      async execute() {
        subToolExecuted = true;
        return { success: true, output: 'sub-tool result' };
      },
    };

    const provider = new MockProvider([
      {
        tool_calls: [{
          id: 'sub_1',
          name: 'TestTool',
          arguments: {},
        }],
      },
      { content: 'Done with sub-tool' },
    ]);

    const tool = createAgentTool(provider, [mockTool]);
    const result = await tool.execute({ task: 'Use the test tool' });

    assert.strictEqual(subToolExecuted, true);
    assert.ok(result.output.includes('Done'));
  });

  it('should respect max iterations for sub-agent', async () => {
    const provider = new MockProvider([
      { tool_calls: [{ id: '1', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '2', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '3', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '4', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '5', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '6', name: 'TestTool', arguments: {} }] },
    ]);

    const mockTool: Tool = {
      name: 'TestTool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: true, output: 'ok' };
      },
    };

    const tool = createAgentTool(provider, [mockTool]);
    const result = await tool.execute({ task: 'Loop test' });

    assert.ok(result.output.includes('max') || result.output.includes('limit') || result.output.includes('iteration'));
  });

  it('should have correct name and description', () => {
    const tool = createAgentTool(new MockProvider([]), []);
    assert.strictEqual(tool.name, 'Agent');
    assert.ok(tool.description.toLowerCase().includes('delegate'));
  });
});
