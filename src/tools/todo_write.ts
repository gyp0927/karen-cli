import { Tool, ToolResult } from '../core/types.js';

interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

/** Encapsulates todo list state for test isolation and multi-instance support. */
export class TodoStore {
  private todos: TodoItem[] = [];

  reset(): void {
    this.todos = [];
  }

  set(todos: TodoItem[]): void {
    this.todos = todos;
  }

  get(): TodoItem[] {
    return this.todos;
  }
}

function isTodoItem(t: unknown): t is { content: unknown; status: unknown; activeForm: unknown } {
  return t !== null && typeof t === 'object' &&
    ('content' in (t as Record<string, unknown>)) &&
    ('status' in (t as Record<string, unknown>)) &&
    ('activeForm' in (t as Record<string, unknown>));
}

const defaultStore = new TodoStore();

export function createTodoWriteTool(store?: TodoStore): Tool {
  const s = store || defaultStore;
  return {
    name: 'todo_write',
    description: 'Maintain a user-visible task list for multi-step work. Use this to show the user what you\'re working on. Exactly ONE item must be in_progress at a time. Mark items completed as soon as their step is done. Pass the FULL list every call (set semantics). Pass [] to clear all.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The COMPLETE todo list. Replaces whatever was there before. Pass [] to clear.',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Imperative step description, e.g. "Add tests for parser".' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Current state.' },
              activeForm: { type: 'string', description: 'Gerund form shown when in_progress, e.g. "Adding tests for parser".' },
            },
            required: ['content', 'status', 'activeForm'],
          },
        },
      },
      required: ['todos'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const rawTodos = Array.isArray(args.todos) ? args.todos : [];

      if (rawTodos.length === 0) {
        s.reset();
        return { success: true, output: 'Todo list cleared.' };
      }

      const items = rawTodos.filter(isTodoItem);
      const inProgress = items.filter((t) => t.status === 'in_progress');
      if (inProgress.length > 1) {
        return { success: false, output: '', error: 'Only ONE item may be in_progress at a time.' };
      }

      const validStatuses: TodoItem['status'][] = ['pending', 'in_progress', 'completed'];
      s.set(items.map((t) => ({
        content: String(t.content || ''),
        status: validStatuses.includes(t.status as TodoItem['status']) ? (t.status as TodoItem['status']) : 'pending',
        activeForm: String(t.activeForm || t.content || ''),
      })));

      // Render the todo list
      const lines: string[] = ['', '\x1b[1m📋 Tasks\x1b[0m'];
      for (const item of s.get()) {
        const icon = item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '⏳' : '○';
        const text = item.status === 'in_progress' ? item.activeForm : item.content;
        const color = item.status === 'completed' ? '\x1b[32m' : item.status === 'in_progress' ? '\x1b[1;33m' : '\x1b[90m';
        lines.push(`  ${color}${icon} ${text}\x1b[0m`);
      }

      const output = lines.join('\n') + '\n';
      // Also print to console so user sees it immediately
      console.log(output);

      return { success: true, output: `${s.get().length} task(s) tracked.` };
    },
  };
}

/** Exposed for REPL status bar integration. */
export function getTodos(store?: TodoStore): TodoItem[] {
  return (store || defaultStore).get();
}
