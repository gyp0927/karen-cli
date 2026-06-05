import { createGetSymbolsTool } from '../../../src/tools/get_symbols.js';
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('get_symbols', () => {
  it('extracts symbols from TypeScript file', async () => {
    const tool = createGetSymbolsTool();
    // Use the test file itself — it definitely has describe/it blocks
    const result = await tool.execute({ path: 'tests/unit/tools/get_symbols.test.ts' });
    assert.strictEqual(result.success, true);
    // Should find at least the describe block and some it() calls
    assert.ok(result.output.length > 0, 'should return symbols');
    assert.ok(!result.output.includes('class AgentLoop'), 'test file has no class'); // sanity
  });

  it('rejects unsupported file types', async () => {
    const tool = createGetSymbolsTool();
    const result = await tool.execute({ path: 'package.json' });
    assert.strictEqual(result.success, false);
  });

  it('rejects missing path', async () => {
    const tool = createGetSymbolsTool();
    const result = await tool.execute({});
    assert.strictEqual(result.success, false);
  });
});
