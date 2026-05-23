import { spawn } from 'child_process';
import { Tool, ToolResult } from '../core/types.js';

interface RunningProcess {
  process: ReturnType<typeof spawn>;
  stdout: string[];
  stderr: string[];
  startTime: number;
}

const runningProcesses = new Map<string, RunningProcess>();
let processCounter = 0;

export function createBashTool(): Tool {
  return {
    name: 'Bash',
    description: 'Execute a shell command. Supports long-running processes with timeout, background tasks, and interactive commands. Use "background: true" to start a persistent process (like npm run dev). Use "process_id" with "read_output" to check on a background process.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Optional. Timeout in milliseconds (default 120000). Use 0 for no timeout.',
        },
        background: {
          type: 'boolean',
          description: 'Optional. If true, run the command in the background and return a process_id.',
        },
        process_id: {
          type: 'string',
          description: 'Optional. For background processes: "read_output" to get latest output, "kill" to stop.',
        },
        action: {
          type: 'string',
          enum: ['read_output', 'kill'],
          description: 'Optional. Action to perform on a background process.',
        },
      },
      required: ['command'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const command = String(args.command || '');
      const timeout = typeof args.timeout === 'number' ? args.timeout : 120000;
      const background = args.background === true;
      const processId = args.process_id ? String(args.process_id) : undefined;
      const action = args.action ? String(args.action) : undefined;

      // Handle background process management
      if (processId && action) {
        const proc = runningProcesses.get(processId);
        if (!proc) {
          return { success: false, output: '', error: `Process ${processId} not found.` };
        }

        if (action === 'kill') {
          proc.process.kill('SIGTERM');
          runningProcesses.delete(processId);
          return { success: true, output: `Process ${processId} killed.` };
        }

        if (action === 'read_output') {
          const stdout = proc.stdout.splice(0, proc.stdout.length).join('');
          const stderr = proc.stderr.splice(0, proc.stderr.length).join('');
          const runtime = Date.now() - proc.startTime;
          let output = stdout;
          if (stderr) output += '\n[stderr]:\n' + stderr;
          output += `\n[Process running for ${Math.round(runtime / 1000)}s]`;
          return { success: true, output };
        }
      }

      if (!command) {
        return { success: false, output: '', error: 'Missing "command" argument.' };
      }

      // Background process
      if (background) {
        const id = `proc_${++processCounter}`;
        const isWin = process.platform === 'win32';
        const shell = isWin ? 'cmd.exe' : 'bash';
        const shellFlag = isWin ? '/c' : '-c';

        const child = spawn(shell, [shellFlag, command], {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: process.cwd(),
        });

        const procEntry: RunningProcess = {
          process: child,
          stdout: [],
          stderr: [],
          startTime: Date.now(),
        };

        child.stdout.on('data', (data) => {
          procEntry.stdout.push(data.toString());
        });
        child.stderr.on('data', (data) => {
          procEntry.stderr.push(data.toString());
        });
        child.on('exit', (code) => {
          procEntry.stdout.push(`\n[Process exited with code ${code}]\n`);
          setTimeout(() => runningProcesses.delete(id), 30000);
        });

        runningProcesses.set(id, procEntry);
        return {
          success: true,
          output: `Started background process ${id}: ${command}\nUse process_id="${id}" action="read_output" to check output.`,
        };
      }

      // Foreground process with real-time streaming support via callback
      return new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        const shell = isWin ? 'cmd.exe' : 'bash';
        const shellFlag = isWin ? '/c' : '-c';

        const child = spawn(shell, [shellFlag, command], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd(),
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = timeout > 0
          ? setTimeout(() => {
              killed = true;
              child.kill('SIGTERM');
            }, timeout)
          : null;

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          if (timer) clearTimeout(timer);
          resolve({ success: false, output: '', error: err.message });
        });

        child.on('close', (code) => {
          if (timer) clearTimeout(timer);
          let output = stdout.trimEnd();
          if (stderr) output += '\n[stderr]:\n' + stderr.trimEnd();

          if (killed) {
            resolve({ success: false, output, error: `Command timed out after ${timeout}ms` });
          } else if (code !== 0) {
            resolve({ success: false, output, error: `Exit code ${code}` });
          } else {
            resolve({ success: true, output });
          }
        });
      });
    },
  };
}
