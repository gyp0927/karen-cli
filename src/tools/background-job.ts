import { Tool, ToolResult } from '../core/types.js';
import { JobManager } from '../jobs/manager.js';

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
          const readyPattern = args.ready_pattern
            ? new RegExp(String(args.ready_pattern), 'i')
            : undefined;

          if (!command) {
            return { success: false, output: '', error: 'spawn requires command.' };
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
