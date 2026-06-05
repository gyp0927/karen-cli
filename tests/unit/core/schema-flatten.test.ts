import { describe, it } from 'node:test';
import assert from 'node:assert';
import { flattenToolSchema } from '../../../src/core/schema-flatten.js';
import { ToolDefinition } from '../../../src/core/types.js';

describe('flattenToolSchema', () => {
  it('passes through simple schema unchanged', () => {
    const tool: ToolDefinition = {
      name: 'Read',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
        },
      },
    };
    const result = flattenToolSchema(tool);
    assert.strictEqual(result.name, 'Read');
    assert.strictEqual(result.parameters.type, 'object');
    assert.deepStrictEqual(result.parameters.properties, {
      file_path: { type: 'string' },
    });
  });

  it('flattens nested object properties', () => {
    const tool: ToolDefinition = {
      name: 'Config',
      description: 'Set config',
      parameters: {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            description: 'A nested object',
            properties: {
              key: { type: 'string' },
            },
          },
        },
      },
    };
    const result = flattenToolSchema(tool);
    const properties = result.parameters.properties as Record<string, unknown>;
    const nested = properties?.nested as Record<string, unknown>;
    assert.strictEqual(nested.type, 'string');
    assert.ok((nested.description as string).includes('JSON string'));
  });

  it('flattens array items that are objects', () => {
    const tool: ToolDefinition = {
      name: 'List',
      description: 'List items',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
      },
    };
    const result = flattenToolSchema(tool);
    const properties = result.parameters.properties as Record<string, unknown>;
    const items = properties?.items as Record<string, unknown>;
    const itemSchema = items.items as Record<string, unknown>;
    assert.strictEqual(itemSchema.type, 'string');
    assert.ok((itemSchema.description as string).includes('JSON string'));
  });

  it('simplifies anyOf to first option', () => {
    const tool: ToolDefinition = {
      name: 'Union',
      description: 'Union test',
      parameters: {
        type: 'object',
        properties: {
          value: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
            ],
          },
        },
      },
    };
    const result = flattenToolSchema(tool);
    const properties = result.parameters.properties as Record<string, unknown>;
    const value = properties?.value as Record<string, unknown>;
    assert.strictEqual(value.type, 'string');
    assert.ok((value.description as string).includes('multiple types'));
    assert.strictEqual(value.anyOf, undefined);
  });

  it('simplifies oneOf to first option', () => {
    const tool: ToolDefinition = {
      name: 'OneOf',
      description: 'OneOf test',
      parameters: {
        type: 'object',
        properties: {
          value: {
            oneOf: [
              { type: 'string' },
              { type: 'boolean' },
            ],
          },
        },
      },
    };
    const result = flattenToolSchema(tool);
    const properties = result.parameters.properties as Record<string, unknown>;
    const value = properties?.value as Record<string, unknown>;
    assert.strictEqual(value.type, 'string');
    assert.ok((value.description as string).includes('multiple types'));
    assert.strictEqual(value.oneOf, undefined);
  });

  it('removes unsupported schema fields', () => {
    const tool: ToolDefinition = {
      name: 'Complex',
      description: 'Complex schema',
      parameters: {
        type: 'object',
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'my-schema',
        $defs: { Foo: { type: 'string' } },
        definitions: { Bar: { type: 'number' } },
        properties: {},
      },
    };
    const result = flattenToolSchema(tool);
    assert.strictEqual(result.parameters.$schema, undefined);
    assert.strictEqual(result.parameters.$id, undefined);
    assert.strictEqual(result.parameters.$defs, undefined);
    assert.strictEqual(result.parameters.definitions, undefined);
  });

  it('recursively flattens nested non-object properties', () => {
    const tool: ToolDefinition = {
      name: 'Deep',
      description: 'Deep nesting',
      parameters: {
        type: 'object',
        properties: {
          outer: {
            type: 'object',
            properties: {
              inner: {
                type: 'string',
                description: 'Inner field',
              },
            },
          },
        },
      },
    };
    const result = flattenToolSchema(tool);
    // The 'outer' property itself gets inlined as string (because it's an object with properties)
    const properties = result.parameters.properties as Record<string, unknown>;
    const outer = properties?.outer as Record<string, unknown>;
    assert.strictEqual(outer.type, 'string');
  });

  it('handles null schema gracefully', () => {
    const tool: ToolDefinition = {
      name: 'Empty',
      description: 'No params',
      parameters: null as unknown as Record<string, unknown>,
    };
    const result = flattenToolSchema(tool);
    assert.strictEqual(result.parameters, null);
  });
});
