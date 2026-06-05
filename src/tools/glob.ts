import { Tool, ToolResult } from '../core/types.js';
import { globSync } from 'fs';
import { requireString, optionalString } from './helpers.js';

export function createGlobTool(): Tool {
  return {
    name: 'Glob',
    description: 'Find files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files' },
        path: { type: 'string', description: 'Base directory to search in' },
      },
      required: ['pattern'],
    },
    async execute(args): Promise<ToolResult> {
      const pattern = requireString(args, 'pattern');
      if (typeof pattern !== 'string') return { success: false, output: '', error: pattern.error };

      try {
        const basePath = optionalString(args, 'path', process.cwd());
        const matches = globSync(pattern, { cwd: basePath });
        return { success: true, output: matches.join('\n') };
      } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
