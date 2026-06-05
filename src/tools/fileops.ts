import { Tool, ToolResult } from '../core/types.js';
import { unlinkSync, copyFileSync, renameSync, existsSync } from 'fs';
import { safePath } from '../utils/paths.js';

export function createFileOpsTool(): Tool {
  return {
    name: 'FileOps',
    description: 'File operations: delete, move, copy, or stat (get file info). Use delete to remove files, move to rename/relocate, copy to duplicate, stat to check existence/size/mtime.',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['delete', 'move', 'copy', 'stat'], description: 'Operation to perform.' },
        path: { type: 'string', description: 'Source file path (for delete/stat) or source path (for move/copy).' },
        destination: { type: 'string', description: 'Destination path (required for move/copy).' },
      },
      required: ['operation', 'path'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const op = String(args.operation || '');
      const rawPath = String(args.path || '');
      const src = safePath(rawPath);

      if (!src) return { success: false, output: '', error: 'Invalid or unsafe path.', errorCode: 'INVALID_INPUT' };

      try {
        switch (op) {
          case 'delete': {
            if (!existsSync(src)) return { success: false, output: '', error: `File not found: ${rawPath}`, errorCode: 'NOT_FOUND' };
            unlinkSync(src);
            return { success: true, output: `Deleted ${rawPath}` };
          }
          case 'move': {
            const rawDest = String(args.destination || '');
            const dest = safePath(rawDest);
            if (!dest) return { success: false, output: '', error: 'Invalid destination path.', errorCode: 'INVALID_INPUT' };
            if (!existsSync(src)) return { success: false, output: '', error: `Source not found: ${rawPath}`, errorCode: 'NOT_FOUND' };
            renameSync(src, dest);
            return { success: true, output: `Moved ${rawPath} → ${rawDest}` };
          }
          case 'copy': {
            const rawDest = String(args.destination || '');
            const dest = safePath(rawDest);
            if (!dest) return { success: false, output: '', error: 'Invalid destination path.', errorCode: 'INVALID_INPUT' };
            if (!existsSync(src)) return { success: false, output: '', error: `Source not found: ${rawPath}`, errorCode: 'NOT_FOUND' };
            copyFileSync(src, dest);
            return { success: true, output: `Copied ${rawPath} → ${rawDest}` };
          }
          case 'stat': {
            if (!existsSync(src)) return { success: true, output: `File not found: ${rawPath}` };
            const { statSync } = await import('fs');
            const s = statSync(src);
            const mtime = s.mtime.toISOString();
            const size = s.size < 1024 ? `${s.size}B` : s.size < 1024 * 1024 ? `${(s.size / 1024).toFixed(1)}KB` : `${(s.size / (1024 * 1024)).toFixed(1)}MB`;
            const type = s.isDirectory() ? 'directory' : s.isFile() ? 'file' : s.isSymbolicLink() ? 'symlink' : 'other';
            return { success: true, output: `${rawPath}: ${type}, ${size}, modified ${mtime}` };
          }
          default:
            return { success: false, output: '', error: `Unknown operation: ${op}` };
        }
      } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), errorCode: 'INTERNAL_ERROR' };
      }
    },
  };
}
