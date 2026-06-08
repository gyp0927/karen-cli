import { spawn } from 'child_process';
import { Tool, ToolResult } from '../core/types.js';

/** Maximum command length to prevent DoS via extremely long commands. */
const MAX_COMMAND_LENGTH = 10000;

/** Dangerous command patterns to block. */
const DANGEROUS_PATTERNS: RegExp[] = [
  // File-system destruction targeting system directories
  /rm\s+(?:-[a-zA-Z]*\s+)*\/(?:\s|$|;|&&|\|\|)/i,
  /rm\s+(?:-[a-zA-Z]*\s+)*\/\*(?:\s|$|;|&&|\|\|)/i,
  /rm\s+(?:-[a-zA-Z]*\s+)*~(?:\s|$|;|&&|\|\|)/i,
  // Disk formatting
  /mkfs\.(?:ext|xfs|btrfs|vfat|ntfs)/i,
  // Raw disk writes
  /dd\s+.*if=\/dev\/(?:zero|null|random|urandom)/i,
  // Fork bomb
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;\s*:/,
  // Direct block device writes
  />\s*\/dev\/(?:sda\d*|sdb\d*|hd[a-z]\d*)/i,
  // Moving root to /dev/null
  /mv\s+.*\/\s+\/dev\/null/i,
  // Recursive chmod on root (any flags containing R or r for recursive)
  /\bchmod\s+-(?:.*R.*|.*r.*)\b/i,
  // Chown root recursively
  /chown\s+(?:-[a-zA-Z]*\s+)*.*\s+\/(?:\s|$|;|&&|\|\|)/i,
  // Piped execution into shells (curl | bash, etc.)
  /\|\s*(?:bash|sh|cmd|powershell|pwsh)/i,
  // Windows: delete disk files with force/quiet flags
  /del\s+\/[fqsr]+.*\\[a-zA-Z]:/i,
  // Windows: format disk
  /format\s+[a-zA-Z]:/i,
  // Windows: recursive delete directory
  /rd\s+\/s\s+\/q/i,
  // Windows: delete tree command
  /deltree/i,
  // Windows: erase files with force/quiet flags
  /erase\s+\/[fqsr]+/i,
];

/** Check if a command contains dangerous patterns. */
function isDangerousCommand(command: string): boolean {
  if (command.includes('\0')) return true;
  return DANGEROUS_PATTERNS.some(p => p.test(command));
}

interface RunningProcess {
  process: ReturnType<typeof spawn>;
  stdout: string[];
  stderr: string[];
  startTime: number;
}

/** Manages background processes to enable test isolation and multi-instance support. */
export class ProcessManager {
  private runningProcesses = new Map<string, RunningProcess>();
  private processCounter = 0;
  private maxBgProcesses: number;

  constructor(maxBgProcesses = 50) {
    this.maxBgProcesses = maxBgProcesses;
  }

  /** Reset state — exposed for test isolation. */
  reset(): void {
    for (const [, proc] of this.runningProcesses) {
      try {
        const isWin = process.platform === 'win32';
        proc.process.kill(isWin ? 'SIGKILL' : 'SIGTERM');
      } catch { /* ignore */ }
    }
    this.runningProcesses.clear();
    this.processCounter = 0;
  }

  /** Get count of tracked processes. */
  getProcessCount(): number {
    return this.runningProcesses.size;
  }

  /** Clean up oldest processes if exceeding limit */
  private enforceProcessLimit(): void {
    if (this.runningProcesses.size >= this.maxBgProcesses) {
      const entries = Array.from(this.runningProcesses.entries());
      const toKill = entries.slice(0, entries.length - this.maxBgProcesses + 1);
      for (const [id, proc] of toKill) {
        try {
          const isWin = process.platform === 'win32';
          proc.process.kill(isWin ? 'SIGKILL' : 'SIGTERM');
        } catch { /* ignore */ }
        this.runningProcesses.delete(id);
      }
    }
  }

  /** Start a background process and return its ID. */
  startBackground(command: string, cwd: string): string {
    this.enforceProcessLimit();
    const id = `proc_${++this.processCounter}`;
    const isWin = process.platform === 'win32';
    const shell = isWin ? 'cmd.exe' : 'bash';
    const shellFlag = isWin ? '/c' : '-c';

    const child = spawn(shell, [shellFlag, command], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
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
      setTimeout(() => this.runningProcesses.delete(id), 30000);
    });

    this.runningProcesses.set(id, procEntry);
    return id;
  }

  /** Kill a background process by ID. */
  killProcess(processId: string): boolean {
    const proc = this.runningProcesses.get(processId);
    if (!proc) return false;
    const isWin = process.platform === 'win32';
    proc.process.kill(isWin ? 'SIGKILL' : 'SIGTERM');
    this.runningProcesses.delete(processId);
    return true;
  }

  /** Read and clear output from a background process. */
  readOutput(processId: string): { stdout: string; stderr: string; runtimeMs: number } | null {
    const proc = this.runningProcesses.get(processId);
    if (!proc) return null;
    const stdout = proc.stdout.splice(0, proc.stdout.length).join('');
    const stderr = proc.stderr.splice(0, proc.stderr.length).join('');
    const runtime = Date.now() - proc.startTime;
    return { stdout, stderr, runtimeMs: runtime };
  }
}

// Default global instance for backward compatibility
const defaultProcessManager = new ProcessManager();

/** Reset process manager state — exposed for test isolation. */
export function resetProcessManager(manager?: ProcessManager): void {
  (manager || defaultProcessManager).reset();
}

export function createBashTool(manager?: ProcessManager): Tool {
  const pm = manager || defaultProcessManager;
  return {
    name: 'Bash',
    description: 'Execute a shell command. Supports long-running processes with timeout, background tasks, and interactive commands. Use "background: true" to start a persistent process (like npm run dev). Use "process_id" with "read_output" to check on a background process. Use "cwd" to specify a working directory.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Optional. Working directory for the command (default: current working directory).',
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
      const cwd = args.cwd ? String(args.cwd) : process.cwd();

      // Handle background process management
      if (processId && action) {
        if (action === 'kill') {
          const killed = pm.killProcess(processId);
          if (!killed) {
            return { success: false, output: '', error: `Process ${processId} not found.` };
          }
          return { success: true, output: `Process ${processId} killed.` };
        }

        if (action === 'read_output') {
          const output = pm.readOutput(processId);
          if (!output) {
            return { success: false, output: '', error: `Process ${processId} not found.` };
          }
          let result = output.stdout;
          if (output.stderr) result += '\n[stderr]:\n' + output.stderr;
          result += `\n[Process running for ${Math.round(output.runtimeMs / 1000)}s]`;
          return { success: true, output: result };
        }
      }

      if (!command) {
        return { success: false, output: '', error: 'Missing "command" argument.' };
      }

      if (command.length > MAX_COMMAND_LENGTH) {
        return { success: false, output: '', error: `Command exceeds maximum length of ${MAX_COMMAND_LENGTH} characters.` };
      }

      if (isDangerousCommand(command)) {
        return { success: false, output: '', error: 'Command blocked: potentially dangerous operation detected.' };
      }

      // Background process
      if (background) {
        const id = pm.startBackground(command, cwd);
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
          cwd,
        });

        let stdout = '';
        let stderr = '';
        let killed = false;
        const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2 MB cap to prevent OOM

        const timer = timeout > 0
          ? setTimeout(() => {
              killed = true;
              const isWin = process.platform === 'win32';
              child.kill(isWin ? 'SIGKILL' : 'SIGTERM');
            }, timeout)
          : null;

        child.stdout.on('data', (data) => {
          if (stdout.length < MAX_OUTPUT_BYTES) {
            stdout += data.toString();
            if (stdout.length > MAX_OUTPUT_BYTES) {
              stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + '\n[... output truncated at 2 MB ...]';
              if (!killed) {
                killed = true;
                const isWin = process.platform === 'win32';
                child.kill(isWin ? 'SIGKILL' : 'SIGTERM');
              }
            }
          }
        });
        child.stderr.on('data', (data) => {
          if (stderr.length < MAX_OUTPUT_BYTES) {
            stderr += data.toString();
            if (stderr.length > MAX_OUTPUT_BYTES) {
              stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + '\n[... stderr truncated at 2 MB ...]';
            }
          }
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
