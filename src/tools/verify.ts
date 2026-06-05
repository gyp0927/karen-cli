import { Tool, ToolResult } from '../core/types.js';
import { execSync } from 'child_process';

/** Tool that runs the project's test suite and reports failures back for auto-fix loops. */
export function createVerifyTool(): Tool {
  return {
    name: 'Verify',
    description: 'Run the project test suite (npm test by default) to verify changes. Use after making code modifications to check for regressions. Returns test output with pass/fail summary.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Optional test command override (default: npm test).',
        },
        cwd: {
          type: 'string',
          description: 'Optional working directory.',
        },
      },
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const command = typeof args.command === 'string' ? args.command : 'npm test';
      const cwd = typeof args.cwd === 'string' ? args.cwd : process.cwd();

      try {
        const output = execSync(command, {
          cwd,
          encoding: 'utf8',
          maxBuffer: 5 * 1024 * 1024,
          timeout: 120_000,
        });
        return { success: true, output: `Tests passed:\n${output.trim().slice(-2000)}` };
      } catch (err) {
        // execSync throws on non-zero exit — extract stdout
        const execErr = err as { stderr?: Buffer | string; stdout?: Buffer | string };
        const stderr = String(execErr.stderr || '');
        const stdout = String(execErr.stdout || '');
        const msg = err instanceof Error ? err.message : String(err);
        const output = stdout + '\n' + stderr;
        return {
          success: false,
          output: `Tests failed:\n${output.trim().slice(-2000)}`,
          error: msg.includes('exceeded') ? 'Test timeout' : 'Tests failed — review output and fix errors.',
        };
      }
    },
  };
}
