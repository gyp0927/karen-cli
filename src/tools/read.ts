import { readFileSync } from 'fs';
import { Tool, ToolResult } from '../core/types.js';

export function createReadTool(): Tool {
  return {
    name: 'Read',
    description: 'Read the contents of a file.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read.',
        },
      },
      required: ['file_path'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const filePath = args.file_path;
      if (typeof filePath !== 'string') {
        return {
          success: false,
          output: '',
          error: 'Missing or invalid "file_path" argument. Expected a string.',
        };
      }

      try {
        const content = readFileSync(filePath, 'utf8');
        return {
          success: true,
          output: content,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          output: '',
          error: message,
        };
      }
    },
  };
}
