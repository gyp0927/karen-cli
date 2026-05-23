import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../utils/logger.js';

export interface Job {
  id: string;
  command: string;
  cwd: string;
  pid?: number;
  output: string[];
  ready: boolean;
  exited: boolean;
  exitCode?: number | null;
  startedAt: number;
  readyAt?: number;
  exitedAt?: number;
}

export interface JobOptions {
  readyPattern?: RegExp;
  readyTimeoutMs?: number;
  maxOutputLines?: number;
  env?: Record<string, string>;
}

export class JobManager {
  private jobs = new Map<string, Job>();
  private processes = new Map<string, ChildProcess>();
  private nextId = 1;

  spawn(command: string, cwd: string, options: JobOptions = {}): Promise<Job> {
    const id = `job-${this.nextId++}`;
    const maxLines = options.maxOutputLines ?? 500;
    const readyTimeout = options.readyTimeoutMs ?? 30_000;

    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      // Use shell: true so paths with spaces and shell operators work correctly.
      // On POSIX we still detach the process so we can kill the whole group.
      const child = spawn(command, [], {
        cwd,
        shell: true,
        detached: !isWindows, // POSIX detached for process group kill
        env: { ...process.env, ...(options.env || {}) },
        windowsHide: true,
      });

      const job: Job = {
        id,
        command,
        cwd,
        pid: child.pid,
        output: [],
        ready: false,
        exited: false,
        startedAt: Date.now(),
      };

      let outputBuffer = '';
      const checkReady = (data: string) => {
        if (job.ready || !options.readyPattern) return;
        outputBuffer += data;
        // Keep last 2KB for pattern matching
        if (outputBuffer.length > 2048) {
          outputBuffer = outputBuffer.slice(-2048);
        }
        if (options.readyPattern.test(outputBuffer)) {
          job.ready = true;
          job.readyAt = Date.now();
        }
      };

      const pushOutput = (line: string) => {
        job.output.push(line);
        if (job.output.length > maxLines) {
          job.output.shift();
        }
      };

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        checkReady(text);
        for (const line of text.split('\n')) {
          if (line.trim()) pushOutput(line.trimEnd());
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        checkReady(text);
        for (const line of text.split('\n')) {
          if (line.trim()) pushOutput(`[stderr] ${line.trimEnd()}`);
        }
      });

      child.on('error', (err) => {
        job.exited = true;
        job.exitCode = -1;
        job.exitedAt = Date.now();
        pushOutput(`[error] ${err.message}`);
        if (!job.ready) {
          reject(err);
        }
      });

      child.on('exit', (code) => {
        job.exited = true;
        job.exitCode = code;
        job.exitedAt = Date.now();
        this.processes.delete(id);
      });

      this.jobs.set(id, job);
      this.processes.set(id, child);

      // If no ready pattern, resolve immediately
      if (!options.readyPattern) {
        job.ready = true;
        job.readyAt = Date.now();
        resolve(job);
        return;
      }

      // Wait for ready signal or timeout
      const checkInterval = setInterval(() => {
        if (job.ready) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve(job);
        }
        if (job.exited) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve(job);
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        if (!job.ready && !job.exited) {
          // Didn't see ready signal but process is still running; resolve anyway
          job.ready = true;
          job.readyAt = Date.now();
        }
        resolve(job);
      }, readyTimeout);
    });
  }

  read(id: string, tailLines?: number): Job | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (tailLines && tailLines > 0) {
      return {
        ...job,
        output: job.output.slice(-tailLines),
      };
    }
    return job;
  }

  list(): Job[] {
    return Array.from(this.jobs.values());
  }

  stop(id: string, graceMs = 2000): boolean {
    const child = this.processes.get(id);
    const job = this.jobs.get(id);
    if (!child || !job) return false;

    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows: taskkill /T to kill tree
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      } catch { /* ignore */ }
    } else {
      // POSIX: try graceful SIGTERM, then SIGKILL
      try {
        process.kill(-child.pid!, 'SIGTERM');
      } catch { /* ignore */ }
      setTimeout(() => {
        if (!job.exited) {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch { /* ignore */ }
        }
      }, graceMs);
    }

    return true;
  }

  cleanup(): number {
    let removed = 0;
    for (const [id, job] of this.jobs) {
      if (job.exited) {
        this.jobs.delete(id);
        this.processes.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
