import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { createReadTool } from '../../../src/tools/read.js';
import { createBashTool } from '../../../src/tools/bash.js';

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    const readTool = createReadTool();
    registry.register(readTool);

    const retrieved = registry.get('Read');
    assert.strictEqual(retrieved, readTool);
  });

  it('should list all tools', () => {
    const registry = new ToolRegistry();
    registry.register(createReadTool());
    registry.register(createBashTool());

    const tools = registry.list();
    assert.strictEqual(tools.length, 2);
    assert.ok(tools.some(t => t.name === 'Read'));
    assert.ok(tools.some(t => t.name === 'Bash'));
  });

  it('should return tool definitions', () => {
    const registry = new ToolRegistry();
    registry.register(createReadTool());

    const defs = registry.definitions();
    assert.strictEqual(defs.length, 1);
    assert.strictEqual(defs[0].name, 'Read');
    assert.strictEqual(defs[0].description, 'Read the contents of a file.');
  });
});