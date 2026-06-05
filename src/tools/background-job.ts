import { Tool, ToolResult } from '../core/types.js';
import { JobManager } from '../jobs/manager.js';

/** Reject commands that look dangerous or destructive. */
function isDangerousCommand(command: string): { dangerous: boolean; reason?: string } {
  const lower = command.toLowerCase().trim();
  // Destructive file operations on system paths
  if (/\brm\s+(-[rf].*)?\s*[/~$]/i.test(command)) {
    return { dangerous: true, reason: 'Potentially destructive rm command targeting system paths.' };
  }
  // Disk/format operations
  if (/\b(mkfs|fdisk|dd\s+if=\/dev)/i.test(lower)) {
    return { dangerous: true, reason: 'Disk formatting or raw device write detected.' };
  }
  // Redirect to sensitive system files
  if (/>\s*(\/etc\/|\/dev\/|~\/\.ssh\/|~\/\.aws\/|C:\\Windows\\)/i.test(command)) {
    return { dangerous: true, reason: 'Redirecting output to sensitive system paths.' };
  }
  // sudo / su escalation
  if (/\b(sudo|su\s+-)\b/i.test(lower)) {
    return { dangerous: true, reason: 'Command requires privilege escalation (sudo/su).' };
  }
  // curl/wget piping to shell
  if (/\b(curl|wget)\b.*\|.*\b(sh|bash|zsh|fish)\b/i.test(lower)) {
    return { dangerous: true, reason: 'Piping network download directly to shell is unsafe.' };
  }
  return { dangerous: false };
}

export function createBackgroundJobTool(jobManager: JobManager): Tool {
  return {
    name: 'BackgroundJob',
    description: 'Spawn long-running background processes (dev servers, watchers, builds) without blocking the agent loop. Use this when a command runs indefinitely or for a long time.\n\nOperations:\n- spawn: Start a background process. Optionally wait for a "ready" signal via regex pattern.\n- read: Get the latest output from a running job.\n- list: Show all active jobs.\n- stop: Terminate a job gracefully (SIGTERM then SIGKILL).\n\nExample ready patterns:\n- "listening on" for dev servers\n- "compiled successfully" for build watchers\n- "ready" for generic readiness',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['spawn', 'read', 'list', 'stop'],
          description: 'Job operation.',
        },
        command: {
          type: 'string',
          description: 'For spawn: the shell command to run.',
        },
        cwd: {
          type: 'string',
          description: 'For spawn: working directory. Defaults to current directory.',
        },
        ready_pattern: {
          type: 'string',
          description: 'For spawn: optional regex string to detect when the job is ready (e.g., "listening on").',
        },
        job_id: {
          type: 'string',
          description: 'For read/stop: the job identifier returned by spawn.',
        },
        tail_lines: {
          type: 'number',
          description: 'For read: number of recent output lines to return.',
        },
      },
      required: ['operation'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const op = String(args.operation || '');

      switch (op) {
        case 'spawn': {
          const command = String(args.command || '');
          const cwd = String(args.cwd || process.cwd());
          let readyPattern: RegExp | undefined;
          if (args.ready_pattern) {
            const patternStr = String(args.ready_pattern).slice(0, 200); // limit length to prevent ReDoS
            try {
              readyPattern = new RegExp(patternStr, 'i');
            } catch {
              return { success: false, output: '', error: `Invalid ready_pattern regex: ${patternStr}` };
            }
          }

          if (!command) {
            return { success: false, output: '', error: 'spawn requires command.' };
          }

          const dangerCheck = isDangerousCommand(command);
          if (dangerCheck.dangerous) {
            return {
              success: false,
              output: '',
              error: `⚠️ Dangerous command blocked: ${dangerCheck.reason}. Command: ${command}`,
            };
          }

          try {
            const job = await jobManager.spawn(command, cwd, {
              readyPattern,
              readyTimeoutMs: 30_000,
              maxOutputLines: 500,
            });
            const status = job.ready ? 'ready' : job.exited ? 'exited' : 'starting';
            return {
              success: true,
              output: `Background job started.\nID: ${job.id}\nPID: ${job.pid ?? 'N/A'}\nStatus: ${status}\nCommand: ${command}`,
            };
          } catch (err) {
            return {
              success: false,
              output: '',
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }

        case 'read': {
          const jobId = String(args.job_id || '');
          const tailLines = typeof args.tail_lines === 'number' ? args.tail_lines : 50;
          const job = jobManager.read(jobId, tailLines);
          if (!job) {
            return { success: false, output: '', error: `Job "${jobId}" not found.` };
          }
          const status = job.exited ? `exited (code ${job.exitCode ?? '?'})` : job.ready ? 'running' : 'starting';
          const out = `Job ${job.id} | Status: ${status}\n\n${job.output.join('\n')}`;
          return { success: true, output: out };
        }

        case 'list': {
          const jobs = jobManager.list();
          if (jobs.length === 0) {
            return { success: true, output: 'No active background jobs.' };
          }
          const lines = jobs.map((j) => {
            const status = j.exited ? `exited(${j.exitCode ?? '?'})` : j.ready ? 'running' : 'starting';
            return `${j.id} | ${status} | ${j.command}`;
          });
          return { success: true, output: `Active jobs:\n${lines.join('\n')}` };
        }

        case 'stop': {
          const jobId = String(args.job_id || '');
          const ok = jobManager.stop(jobId);
          if (!ok) return { success: false, output: '', error: `Job "${jobId}" not found.` };
          return { success: true, output: `Job ${jobId} stopped.` };
        }

        default:
          return { success: false, output: '', error: `Unknown operation: ${op}` };
      }
    },
  };
}
