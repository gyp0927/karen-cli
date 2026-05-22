export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dependencies: string[];
  createdAt: number;
  updatedAt: number;
  result?: string;
  error?: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  dependencies?: string[];
}

export interface TaskSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}
