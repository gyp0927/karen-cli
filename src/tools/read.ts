import { readFileSync } from 'fs';
import { Tool, ToolResult } from '../core/types.js';
import { requireString } from './helpers.js';
import { safePath } from '../utils/paths.js';

export function createReadTool(): Tool {
  return {
    name: 'Read',
    description: 'Read the contents of a file. Supports reading specific line ranges (offset/limit) for large files.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read.',
        },
        offset: {
          type: 'number',
          description: 'Optional. Line number to start reading from (1-indexed).',
        },
        limit: {
          type: 'number',
          description: 'Optional. Maximum number of lines to read.',
        },
      },
      required: ['file_path'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const rawPath = requireString(args, 'file_path');
      if (typeof rawPath !== 'string') return { success: false, output: '', error: rawPath.error };
      const filePath = safePath(rawPath);
      if (!filePath) return { success: false, output: '', error: 'Invalid or unsafe file path.' };

      try {
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const totalLines = lines.length;
        
        const offset = typeof args.offset === 'number' ? Math.max(1, args.offset) : 1;
        const limit = typeof args.limit === 'number' ? Math.max(1, args.limit) : totalLines;
        
        // If offset or limit specified, return only the requested range
        if (args.offset !== undefined || args.limit !== undefined) {
          const startIndex = offset - 1; // Convert to 0-indexed
          const endIndex = Math.min(startIndex + limit, totalLines);
          const selectedLines = lines.slice(startIndex, endIndex);
          
          const header = `[Lines ${offset}-${endIndex} of ${totalLines}]\n`;
          const output = header + selectedLines.join('\n');
          return { success: true, output };
        }
        
        return { success: true, output: content };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as NodeJS.ErrnoException).code;
        return { success: false, output: '', error: msg, errorCode: code === 'ENOENT' ? 'NOT_FOUND' : code === 'EACCES' ? 'PERMISSION_DENIED' : 'INTERNAL_ERROR' };
      }
    },
  };
}
