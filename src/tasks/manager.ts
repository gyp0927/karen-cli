import { Task, TaskInput, TaskStatus, TaskSummary } from './types.js';
import { randomUUID } from 'crypto';

export class TaskManager {
  private tasks: Map<string, Task> = new Map();

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
}
