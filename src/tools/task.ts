import { Tool, ToolResult } from '../core/types.js';
import { TaskManager } from '../tasks/manager.js';

export function createTaskTool(taskManager: TaskManager): Tool {
  return {
    name: 'Task',
    description: 'Create and manage tasks in the task graph. Use this when the user asks for multi-step work so progress can be tracked.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'start', 'complete', 'fail', 'list', 'summary'],
          description: 'Action to perform on tasks',
        },
        id: {
          type: 'string',
          description: 'Task ID (required for start, complete, fail)',
        },
        title: {
          type: 'string',
          description: 'Task title (required for create)',
        },
        description: {
          type: 'string',
          description: 'Optional task description',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task IDs this task depends on',
        },
        result: {
          type: 'string',
          description: 'Result notes when completing a task',
        },
        error: {
          type: 'string',
          description: 'Error message when failing a task',
        },
      },
      required: ['action'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const action = String(args.action);

        switch (action) {
          case 'create': {
            const title = String(args.title || '');
            if (!title) {
              return { success: false, output: '', error: 'title is required for create' };
            }
            const task = taskManager.create({
              title,
              description: args.description ? String(args.description) : undefined,
              dependencies: Array.isArray(args.dependencies) ? args.dependencies.map(String) : undefined,
            });
            return { success: true, output: `Created task ${task.id}: ${task.title}` };
          }
          case 'start': {
            const id = String(args.id || '');
            if (!id) {
              return { success: false, output: '', error: 'id is required for start' };
            }
            const task = taskManager.start(id);
            if (!task) {
              return { success: false, output: '', error: 'Task not found or not ready to start' };
            }
            return { success: true, output: `Started task ${task.id}: ${task.title}` };
          }
          case 'complete': {
            const id = String(args.id || '');
            if (!id) {
              return { success: false, output: '', error: 'id is required for complete' };
            }
            const task = taskManager.complete(id, args.result ? String(args.result) : undefined);
            if (!task) {
              return { success: false, output: '', error: 'Task not found or not running' };
            }
            return { success: true, output: `Completed task ${task.id}: ${task.title}` };
          }
          case 'fail': {
            const id = String(args.id || '');
            if (!id) {
              return { success: false, output: '', error: 'id is required for fail' };
            }
            const task = taskManager.fail(id, args.error ? String(args.error) : undefined);
            if (!task) {
              return { success: false, output: '', error: 'Task not found or not running' };
            }
            return { success: true, output: `Failed task ${task.id}: ${task.title}` };
          }
          case 'list': {
            const tasks = taskManager.list();
            if (tasks.length === 0) {
              return { success: true, output: 'No tasks.' };
            }
            const lines = tasks.map(t => `[${t.status}] ${t.title} (${t.id})`);
            return { success: true, output: lines.join('\n') };
          }
          case 'summary': {
            const s = taskManager.getSummary();
            return {
              success: true,
              output: `Tasks: ${s.total} total | Pending: ${s.pending} | Running: ${s.running} | Completed: ${s.completed} | Failed: ${s.failed}`,
            };
          }
          default:
            return { success: false, output: '', error: `Unknown action: ${action}` };
        }
      } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
