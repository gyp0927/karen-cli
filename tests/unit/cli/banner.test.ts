import { describe, it } from 'node:test';
import assert from 'node:assert';
import { printBanner } from '../../../src/cli/banner.js';
import { BaseProvider } from '../../../src/providers/base.js';
import { Message, ProviderResponse, ToolDefinition } from '../../../src/core/types.js';

class MockProvider extends BaseProvider {
  name = 'mock';
  readonly model = 'mock-model';

  async chat(_messages: Message[], _tools?: ToolDefinition[]): Promise<ProviderResponse> {
    return { content: 'hello' };
  }
}

describe('printBanner', () => {
  it('should print banner without throwing', () => {
    const provider = new MockProvider();
    assert.doesNotThrow(() => printBanner(provider, '0.1.0'));
  });

  it('should include version in output', () => {
    const provider = new MockProvider();
    const originalLog = console.log;
    let output = '';
    console.log = (msg: string) => { output += msg + '\n'; };

    printBanner(provider, '1.2.3');

    console.log = originalLog;
    assert(output.includes('karen-cli v1.2.3'));
  });

  it('should include provider name in output', () => {
    const provider = new MockProvider();
    const originalLog = console.log;
    let output = '';
    console.log = (msg: string) => { output += msg + '\n'; };

    printBanner(provider, '0.1.0');

    console.log = originalLog;
    assert(output.includes('Provider: mock'));
    assert(output.includes('Model: mock-model'));
  });

  it('should include working directory in output', () => {
    const provider = new MockProvider();
    const originalLog = console.log;
    let output = '';
    console.log = (msg: string) => { output += msg + '\n'; };

    printBanner(provider, '0.1.0');

    console.log = originalLog;
    assert(output.includes('Working directory:'));
  });

  it('should include commands section', () => {
    const provider = new MockProvider();
    const originalLog = console.log;
    let output = '';
    console.log = (msg: string) => { output += msg + '\n'; };

    printBanner(provider, '0.1.0');

    console.log = originalLog;
    assert(output.includes('Commands:'));
    assert(output.includes('/exit'));
    assert(output.includes('/help'));
  });
});
