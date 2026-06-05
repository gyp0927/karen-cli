import { ToolDefinition } from './types.js';

/**
 * DeepSeek (and some other models) handle deeply nested JSON schemas poorly.
 * Flatten nested object schemas by inlining one level of properties, and remove
 * excessive `anyOf` / `oneOf` unions that confuse the model.
 */
export function flattenToolSchema(tool: ToolDefinition): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: flattenSchema(tool.parameters),
  };
}

function flattenSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema;

  // Deep-clone to avoid mutating the original ToolDefinition's nested objects
  const result: Record<string, unknown> = structuredClone(schema) as Record<string, unknown>;

  // Simplify anyOf/oneOf to first option + description note
  if (result.anyOf && Array.isArray(result.anyOf)) {
    const first = result.anyOf[0];
    if (first && typeof first === 'object') {
      result.type = (first as Record<string, unknown>).type || 'string';
      result.description = (result.description || '') + ' (can be multiple types)';
      delete result.anyOf;
    }
  }
  if (result.oneOf && Array.isArray(result.oneOf)) {
    const first = result.oneOf[0];
    if (first && typeof first === 'object') {
      result.type = (first as Record<string, unknown>).type || 'string';
      result.description = (result.description || '') + ' (can be multiple types)';
      delete result.oneOf;
    }
  }

  // Flatten properties one level deep
  if (result.properties && typeof result.properties === 'object') {
    const props = result.properties as Record<string, unknown>;
    const flattenedProps: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(props)) {
      if (val && typeof val === 'object') {
        const prop = val as Record<string, unknown>;
        if (prop.type === 'object' && prop.properties) {
          // Inline nested object as JSON string to avoid deep nesting
          flattenedProps[key] = {
            type: 'string',
            description: (prop.description || key) + ' (provide as JSON string)',
          };
        } else {
          flattenedProps[key] = flattenSchema(prop);
        }
      } else {
        flattenedProps[key] = val;
      }
    }

    result.properties = flattenedProps;
  }

  // Flatten items schema in arrays
  if (result.items && typeof result.items === 'object' && !Array.isArray(result.items)) {
    const items = result.items as Record<string, unknown>;
    if (items.type === 'object' && items.properties) {
      result.items = {
        type: 'string',
        description: (items.description || 'item') + ' (provide as JSON string)',
      };
    } else {
      result.items = flattenSchema(items);
    }
  }

  // Remove unsupported fields for some providers
  delete result.$schema;
  delete result.$id;
  delete result.definitions;
  delete result.$defs;

  return result;
}
