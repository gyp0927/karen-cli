import { Tool, ToolResult } from '../core/types.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export function createGrepTool(): Tool {
  return {
    name: 'Grep',
    description: 'Search for a pattern in files.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Directory or file to search in',
        },
      },
      required: ['pattern'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const pattern = new RegExp(String(args.pattern));
        const searchPath = args.path ? String(args.path) : process.cwd();
        const results: string[] = [];

        function searchFile(filePath: string) {
          const content = readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (pattern.test(line)) {
              results.push(`${filePath}:${idx + 1}:${line}`);
            }
          });
        }

        function searchDir(dirPath: string) {
          const entries = readdirSync(dirPath);
          for (const entry of entries) {
            if (entry === 'node_modules' || entry === '.git') continue;
            const fullPath = join(dirPath, entry);
            const stats = statSync(fullPath);
            if (stats.isDirectory()) {
              searchDir(fullPath);
            } else if (stats.isFile()) {
              try { searchFile(fullPath); } catch { /* skip binary */ }
            }
          }
        }

        const stats = statSync(searchPath);
        if (stats.isDirectory()) {
          searchDir(searchPath);
        } else {
          searchFile(searchPath);
        }

        return { success: true, output: results.join('\n') };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
