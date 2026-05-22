import { Tool, ToolResult } from '../core/types.js';
import { readFileSync, writeFileSync } from 'fs';

export function createEditTool(): Tool {
  return {
    name: 'Edit',
    description: 'Edit a file by replacing an exact string with another.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'Exact text to replace',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const filePath = String(args.file_path);
        const oldString = String(args.old_string);
        const newString = String(args.new_string);

        const content = readFileSync(filePath, 'utf8');
        if (!content.includes(oldString)) {
          return { success: false, output: '', error: `old_string not found in ${filePath}` };
        }

        const newContent = content.replace(oldString, newString);
        writeFileSync(filePath, newContent, 'utf8');
        return { success: true, output: `Edited ${filePath}` };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
