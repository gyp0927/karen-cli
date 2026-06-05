import { Task, TaskInput, TaskStatus, TaskSummary } from './types.js';
import { randomUUID } from 'crypto';

interface QueuedTask {
  task: Task;
  execute: () => Promise<void>;
  priority: number;
}

export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private queue: QueuedTask[] = [];
  private running = 0;
  private maxConcurrency = 3;

  constructor(maxConcurrency?: number) {
    if (maxConcurrency && maxConcurrency > 0) {
      this.maxConcurrency = maxConcurrency;
    }
  }

  create(input: TaskInput): Task {
    const now = Date.now();
    const task: Task = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      status: 'pending',
      dependencies: input.dependencies || [],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  getById(id: string): Task | null {
    return this.tasks.get(id) || null;
  }

  list(): Task[] {
    return Array.from(this.tasks.values());
  }

  getByStatus(status: TaskStatus): Task[] {
    return this.list().filter(t => t.status === status);
  }

  private updateStatus(id: string, status: TaskStatus, updates?: Partial<Task>): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    const updated: Task = {
      ...task,
      ...updates,
      status,
      updatedAt: Date.now(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  start(id: string): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== 'pending') return null;

    const depsCompleted = task.dependencies.every(depId => {
      const dep = this.tasks.get(depId);
      return dep?.status === 'completed';
    });
    if (!depsCompleted) return null;

    return this.updateStatus(id, 'running');
  }

  complete(id: string, result?: string): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== 'running') return null;

    return this.updateStatus(id, 'completed', { result });
  }

  fail(id: string, error?: string): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== 'running') return null;

    return this.updateStatus(id, 'failed', { error });
  }

  getReadyTasks(): Task[] {
    return this.list().filter(task => {
      if (task.status !== 'pending') return false;
      return task.dependencies.every(depId => {
        const dep = this.tasks.get(depId);
        return dep?.status === 'completed';
      });
    });
  }

  getBlockedTasks(): Task[] {
    return this.list().filter(task => {
      if (task.status !== 'pending') return false;
      return task.dependencies.some(depId => {
        const dep = this.tasks.get(depId);
        return dep?.status !== 'completed';
      });
    });
  }

  getSummary(): TaskSummary {
    const tasks = this.list();
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };
  }

  /** Queue a task for execution with concurrency control */
  async enqueue(taskId: string, execute: () => Promise<void>, priority = 0): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    this.queue.push({ task, execute, priority });
    this.queue.sort((a, b) => b.priority - a.priority);

    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.running >= this.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const next = this.queue.shift();
    if (!next) return;

    this.running++;
    const task = this.start(next.task.id);
    if (!task) {
      this.running--;
      return;
    }

    try {
      await next.execute();
      this.complete(next.task.id);
    } catch (err) {
      this.fail(next.task.id, err instanceof Error ? err.message : String(err));
    } finally {
      this.running--;
      // Process next items in queue
      this.processQueue();
    }
  }

  /** Get current queue status */
  getQueueStatus(): { queued: number; running: number; maxConcurrency: number } {
    return {
      queued: this.queue.length,
      running: this.running,
      maxConcurrency: this.maxConcurrency,
    };
  }

  /** Set max concurrency */
  setMaxConcurrency(max: number): void {
    this.maxConcurrency = Math.max(1, max);
    // Trigger processing in case we can now run more
    this.processQueue();
  }
}
