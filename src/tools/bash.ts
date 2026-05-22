import { execSync } from 'child_process';
import { Tool, ToolResult } from '../core/types.js';

export function createBashTool(): Tool {
  return {
    name: 'Bash',
    description: 'Execute a shell command.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
      },
      required: ['command'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const command = args.command as string;
      try {
        const output = execSync(command, { timeout: 120000, encoding: 'utf-8' });
        return { success: true, output: output.trimEnd() };
      } catch (error) {
        return { success: false, output: '', error: (error as Error).message };
      }
    },
  };
}
