import { Tool, ToolResult } from '../core/types.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

function findGitRoot(cwd: string): string | null {
  let current = cwd;
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function runGit(args: string[], cwd?: string): { success: boolean; output: string; error?: string } {
  try {
    const gitRoot = cwd ? findGitRoot(cwd) : process.cwd();
    const execCwd = gitRoot || cwd || process.cwd();
    const output = execSync(`git ${args.join(' ')}`, {
      cwd: execCwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return { success: true, output: output.trimEnd() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error: message };
  }
}

export function createGitTool(): Tool {
  return {
    name: 'Git',
    description: 'Git operations: check status, diff, log, branch, checkout, commit, add. Use this to understand repository state and make version control changes. Always run status first before making changes.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['status', 'diff', 'log', 'branch', 'checkout', 'commit', 'add', 'show'],
          description: 'The git operation to perform.',
        },
        path: {
          type: 'string',
          description: 'Optional. File path or directory to run git from. Defaults to current directory.',
        },
        target: {
          type: 'string',
          description: 'Optional. Target for checkout (branch/commit), or file path for add/diff.',
        },
        message: {
          type: 'string',
          description: 'Optional. Commit message for commit operation.',
        },
        count: {
          type: 'number',
          description: 'Optional. Number of log entries to show (default 10).',
        },
      },
      required: ['operation'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const operation = String(args.operation);
      const cwd = args.path ? String(args.path) : undefined;

      switch (operation) {
        case 'status': {
          const result = runGit(['status', '--short'], cwd);
          if (!result.success) return result;
          const output = result.output || 'Working tree clean';
          return { success: true, output };
        }
        case 'diff': {
          const target = args.target ? String(args.target) : '';
          const result = runGit(target ? ['diff', target] : ['diff'], cwd);
          return result;
        }
        case 'log': {
          const count = typeof args.count === 'number' ? args.count : 10;
          const result = runGit(['log', `--max-count=${count}`, '--oneline', '--decorate'], cwd);
          return result;
        }
        case 'branch': {
          const result = runGit(['branch', '-a'], cwd);
          return result;
        }
        case 'checkout': {
          const target = String(args.target || '');
          if (!target) {
            return { success: false, output: '', error: 'Missing "target" for checkout (branch name or commit hash).' };
          }
          const result = runGit(['checkout', target], cwd);
          return result;
        }
        case 'add': {
          const target = String(args.target || '.');
          const result = runGit(['add', target], cwd);
          return result;
        }
        case 'commit': {
          const message = String(args.message || '');
          if (!message) {
            return { success: false, output: '', error: 'Missing "message" for commit.' };
          }
          const result = runGit(['commit', '-m', `"${message}"`], cwd);
          return result;
        }
        case 'show': {
          const target = String(args.target || 'HEAD');
          const result = runGit(['show', '--stat', target], cwd);
          return result;
        }
        default:
          return { success: false, output: '', error: `Unknown git operation: ${operation}` };
      }
    },
  };
}
