import { Tool, ToolResult } from '../core/types.js';
import { readdir, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import { safePath } from '../utils/paths.js';

interface FileEntry {
  path: string;
  relativePath: string;
  size: number;
  extension: string;
  type: 'code' | 'config' | 'doc' | 'asset' | 'other';
  imports?: string[];
}

interface ProjectIndex {
  root: string;
  files: FileEntry[];
  languages: Record<string, number>;
  totalFiles: number;
  totalSize: number;
}

let cachedIndex: ProjectIndex | null = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/** Reset the module-level index cache — exposed for test isolation. */
export function resetIndexCache(): void {
  cachedIndex = null;
  cacheTime = 0;
}

function classifyFile(ext: string): FileEntry['type'] {
  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.php', '.rb', '.swift', '.kt'];
  const configExts = ['.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.config'];
  const docExts = ['.md', '.mdx', '.txt', '.rst'];
  const assetExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'];

  if (codeExts.includes(ext)) return 'code';
  if (configExts.includes(ext)) return 'config';
  if (docExts.includes(ext)) return 'doc';
  if (assetExts.includes(ext)) return 'asset';
  return 'other';
}

async function scanDirectory(dir: string, root: string, entries: FileEntry[] = [], depth = 0): Promise<FileEntry[]> {
  if (depth > 20) return entries;

  const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.venv', 'venv'];

  try {
    const items = await readdir(dir);
    for (const item of items) {
      if (item.startsWith('.') && item !== '.github') continue;
      const fullPath = join(dir, item);
      const st = await stat(fullPath);

      if (st.isDirectory()) {
        if (skipDirs.includes(item)) continue;
        await scanDirectory(fullPath, root, entries, depth + 1);
      } else if (st.isFile()) {
        const ext = extname(item).toLowerCase();
        entries.push({
          path: fullPath,
          relativePath: relative(root, fullPath),
          size: st.size,
          extension: ext,
          type: classifyFile(ext),
        });
      }
    }
  } catch { /* ignore permission errors */ }

  return entries;
}

async function buildIndex(root: string): Promise<ProjectIndex> {
  const files = await scanDirectory(root, root);
  const languages: Record<string, number> = {};
  let totalSize = 0;

  for (const f of files) {
    if (f.type === 'code' && f.extension) {
      languages[f.extension] = (languages[f.extension] || 0) + 1;
    }
    totalSize += f.size;
  }

  return {
    root,
    files,
    languages,
    totalFiles: files.length,
    totalSize,
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function createIndexTool(): Tool {
  return {
    name: 'Index',
    description: 'Index and explore the project structure. Shows file tree, language breakdown, and can find files by pattern. Use this to understand large projects before making changes.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['scan', 'tree', 'find', 'languages', 'stats'],
          description: 'scan: rebuild index, tree: show directory tree, find: search by pattern, languages: show language breakdown, stats: show project stats.',
        },
        path: {
          type: 'string',
          description: 'Optional. Root path to scan (default: current working directory).',
        },
        pattern: {
          type: 'string',
          description: 'For "find": substring or extension to search for (e.g., ".test.ts" or "config").',
        },
        max_depth: {
          type: 'number',
          description: 'For "tree": maximum depth to show (default 3).',
        },
      },
      required: ['operation'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const operation = String(args.operation);
      const rawRoot = args.path ? String(args.path) : process.cwd();
      const root = safePath(rawRoot);
      if (!root) {
        return { success: false, output: '', error: 'Invalid or unsafe file path.' };
      }

      if (operation === 'scan') {
        cachedIndex = await buildIndex(root);
        cacheTime = Date.now();
        return {
          success: true,
          output: `Indexed ${cachedIndex.totalFiles} files (${formatSize(cachedIndex.totalSize)}) in ${cachedIndex.root}`,
        };
      }

      // Use cache if fresh, otherwise build
      if (!cachedIndex || Date.now() - cacheTime > CACHE_TTL || cachedIndex.root !== root) {
        cachedIndex = await buildIndex(root);
        cacheTime = Date.now();
      }

      const index = cachedIndex;

      switch (operation) {
        case 'stats': {
          const codeFiles = index.files.filter(f => f.type === 'code').length;
          const configFiles = index.files.filter(f => f.type === 'config').length;
          const docFiles = index.files.filter(f => f.type === 'doc').length;
          return {
            success: true,
            output: `Project: ${index.root}\nTotal files: ${index.totalFiles}\nCode files: ${codeFiles}\nConfig files: ${configFiles}\nDocs: ${docFiles}\nTotal size: ${formatSize(index.totalSize)}`,
          };
        }
        case 'languages': {
          const entries = Object.entries(index.languages).sort((a, b) => b[1] - a[1]);
          const lines = entries.map(([ext, count]) => `  ${ext}: ${count} files`);
          return {
            success: true,
            output: `Language breakdown:\n${lines.join('\n')}`,
          };
        }
        case 'find': {
          const pattern = String(args.pattern || '').toLowerCase();
          if (!pattern) {
            return { success: false, output: '', error: 'Missing "pattern" for find operation.' };
          }
          const matches = index.files.filter(f =>
            f.relativePath.toLowerCase().includes(pattern) ||
            f.extension.toLowerCase() === pattern
          );
          if (matches.length === 0) {
            return { success: true, output: `No files matching "${pattern}".` };
          }
          const lines = matches.slice(0, 20).map(f => `  ${f.relativePath} (${formatSize(f.size)})`);
          let output = `Found ${matches.length} file(s) matching "${pattern}":\n${lines.join('\n')}`;
          if (matches.length > 20) output += '\n  ... and more';
          return { success: true, output };
        }
        case 'tree': {
          const maxDepth = typeof args.max_depth === 'number' ? args.max_depth : 3;
          const treeLines: string[] = [];

          async function buildTree(dir: string, prefix = '', depth = 0): Promise<void> {
            if (depth > maxDepth) return;
            let items: string[];
            try { items = await readdir(dir); } catch { return; }
            const dirs: string[] = [];
            const files: string[] = [];

            for (const item of items) {
              if (item.startsWith('.') && item !== '.github') continue;
              const full = join(dir, item);
              try {
                const s = await stat(full);
                if (s.isDirectory()) {
                  const skip = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__'];
                  if (!skip.includes(item)) dirs.push(item);
                } else {
                  files.push(item);
                }
              } catch { /* ignore */ }
            }

            const all = [...dirs.sort(), ...files.sort()];
            for (let i = 0; i < all.length; i++) {
              const isLast = i === all.length - 1;
              const item = all[i];
              const connector = isLast ? '└── ' : '├── ';
              treeLines.push(prefix + connector + item);
              const fullPath = join(dir, item);
              try {
                const s = await stat(fullPath);
                if (s.isDirectory()) {
                  const ext = isLast ? '    ' : '│   ';
                  await buildTree(fullPath, prefix + ext, depth + 1);
                }
              } catch { /* ignore */ }
            }
          }

          treeLines.push(relative(process.cwd(), root) || '.');
          await buildTree(root);
          return { success: true, output: treeLines.join('\n') };
        }
        default:
          return { success: false, output: '', error: `Unknown operation: ${operation}` };
      }
    },
  };
}
