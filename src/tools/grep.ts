import { Tool, ToolResult } from '../core/types.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { safePath } from '../utils/paths.js';

export function createGrepTool(): Tool {
  return {
    name: 'Grep',
    description: 'Search for a pattern in files. Supports regex, context lines, file glob filtering, and case-insensitive search.',
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
        context_lines: {
          type: 'number',
          description: 'Optional. Number of lines before and after each match to include (default 0).',
        },
        file_pattern: {
          type: 'string',
          description: 'Optional. Glob pattern to filter files (e.g., "*.ts", "*.md").',
        },
        ignore_case: {
          type: 'boolean',
          description: 'Optional. If true, perform case-insensitive search.',
        },
        max_file_size: {
          type: 'number',
          description: 'Optional. Max file size in KB to search (default 1024).',
        },
      },
      required: ['pattern'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const patternStr = String(args.pattern).slice(0, 1000); // limit length to prevent ReDoS
        const MAX_RESULTS = 500; // hard cap on number of result lines
        let resultCount = 0;
        let pattern: RegExp;
        try {
          const flags = args.ignore_case === true ? 'i' : '';
          pattern = new RegExp(patternStr, flags);
        } catch {
          return { success: false, output: '', error: `Invalid regex pattern: ${patternStr}` };
        }
        const rawPath = args.path ? String(args.path) : process.cwd();
        const searchPath = safePath(rawPath);
        if (!searchPath) {
          return { success: false, output: '', error: 'Invalid or unsafe search path.' };
        }
        const results: string[] = [];

        const ctx = typeof args.context_lines === 'number' ? Math.max(0, Math.min(10, args.context_lines)) : 0;
        const fileGlob = args.file_pattern ? String(args.file_pattern) : null;
        const maxFileSizeKB = typeof args.max_file_size === 'number' ? args.max_file_size : 1024;
        const maxFileSizeBytes = maxFileSizeKB * 1024;

        function matchesGlob(fileName: string, glob: string): boolean {
          // Simple glob matching: *.ext or *pattern*
          if (glob.startsWith('*.')) {
            const ext = glob.slice(2);
            return fileName.endsWith('.' + ext);
          }
          if (glob.startsWith('*') && glob.endsWith('*')) {
            return fileName.includes(glob.slice(1, -1));
          }
          if (glob.startsWith('*')) {
            return fileName.endsWith(glob.slice(1));
          }
          if (glob.endsWith('*')) {
            return fileName.startsWith(glob.slice(0, -1));
          }
          return fileName === glob;
        }

        function searchFile(filePath: string) {
          const content = readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          const matched = new Set<number>();
          const MAX_LINE_LEN = 8192; // protect against ReDoS on minified lines
          lines.forEach((line, idx) => {
            const testLine = line.length > MAX_LINE_LEN ? line.slice(0, MAX_LINE_LEN) : line;
            if (pattern.test(testLine)) {
              matched.add(idx);
            }
          });
          // Expand to include context lines
          const toShow = new Set<number>();
          for (const idx of matched) {
            for (let c = Math.max(0, idx - ctx); c <= Math.min(lines.length - 1, idx + ctx); c++) {
              toShow.add(c);
            }
          }
          const sorted = [...toShow].sort((a, b) => a - b);
          let lastIdx = -2;
          for (const idx of sorted) {
            if (resultCount++ >= MAX_RESULTS) {
              results.push('[... results truncated at 500 lines ...]');
              return;
            }
            const marker = matched.has(idx) ? '>' : ' ';
            if (idx > lastIdx + 1 && lastIdx >= 0) results.push('---');
            results.push(`${filePath}:${idx + 1}:${marker}${lines[idx]}`);
            lastIdx = idx;
          }
        }

        function searchDir(dirPath: string, depth = 0) {
          if (depth > 20) return; // prevent stack overflow on deep directory trees
          const entries = readdirSync(dirPath);
          for (const entry of entries) {
            if (entry === 'node_modules' || entry === '.git' || entry.startsWith('.')) continue;
            const fullPath = join(dirPath, entry);
            let stats;
            try { stats = statSync(fullPath); } catch { continue; }
            if (stats.isDirectory()) {
              searchDir(fullPath, depth + 1);
            } else if (stats.isFile()) {
              // Check file glob filter
              if (fileGlob && !matchesGlob(entry, fileGlob)) continue;
              // Skip files > max size to avoid reading huge files into memory
              if (stats.size > maxFileSizeBytes) continue;
              try { searchFile(fullPath); } catch { /* skip unreadable */ }
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
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
