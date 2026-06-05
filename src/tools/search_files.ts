import { Tool, ToolResult } from '../core/types.js';
import { readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

export function createSearchFilesTool(): Tool {
  return {
    name: 'search_files',
    description: 'Find files by NAME (not content). Searches recursively for files whose name matches a substring or regex. Use this to locate files by name — different from Grep (content search) and Glob (pattern match).',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Substring or regex to match against filenames (case-insensitive).' },
        path: { type: 'string', description: 'Directory to search (default: project root).' },
        max_results: { type: 'number', description: 'Max results (default 50).' },
      },
      required: ['pattern'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const pattern = String(args.pattern || '').toLowerCase();
      const searchRoot = args.path ? String(args.path) : process.cwd();
      const maxResults = typeof args.max_results === 'number' ? args.max_results : 50;

      if (!pattern) return { success: false, output: '', error: 'Missing pattern argument.' };

      const results: string[] = [];
      const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.venv', 'venv']);

      function walk(dir: string, depth = 0) {
        if (depth > 15 || results.length >= maxResults) return;
        let entries: string[];
        try { entries = readdirSync(dir); } catch { return; }

        for (const entry of entries) {
          if (results.length >= maxResults) return;
          const fullPath = join(dir, entry);

          if (skipDirs.has(entry)) continue;
          if (entry.startsWith('.') && entry !== '.github') continue;

          try {
            const st = statSync(fullPath);
            if (st.isDirectory()) {
              walk(fullPath, depth + 1);
            } else if (st.isFile()) {
              if (basename(entry).toLowerCase().includes(pattern)) {
                results.push(fullPath);
              }
            }
          } catch { /* skip */ }
        }
      }

      try { walk(searchRoot); } catch { return { success: false, output: '', error: `Cannot read directory: ${searchRoot}` }; }

      if (results.length === 0) {
        return { success: true, output: `No files matching "${pattern}" found.` };
      }

      return {
        success: true,
        output: `${results.length} file(s) matching "${pattern}":\n${results.join('\n')}`,
      };
    },
  };
}
