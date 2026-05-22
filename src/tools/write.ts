import { Tool, ToolResult } from '../core/types.js';
import { writeFileSync } from 'fs';

export function createWriteTool(): Tool {
  return {
    name: 'Write',
    description: 'Write content to a file. Overwrites if the file exists.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to write',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const filePath = String(args.file_path);
        const content = String(args.content);
        writeFileSync(filePath, content, 'utf8');
        return { success: true, output: `Wrote ${filePath}` };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
