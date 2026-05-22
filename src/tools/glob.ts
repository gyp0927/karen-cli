import { Tool, ToolResult } from '../core/types.js';
import { globSync } from 'fs';

export function createGlobTool(): Tool {
  return {
    name: 'Glob',
    description: 'Find files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files',
        },
        path: {
          type: 'string',
          description: 'Base directory to search in',
        },
      },
      required: ['pattern'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const pattern = String(args.pattern);
        const basePath = args.path ? String(args.path) : process.cwd();
        const matches = globSync(pattern, { cwd: basePath });
        return { success: true, output: matches.join('\n') };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
