export interface ParsedCommand {
  type: 'exit' | 'model' | 'tools' | 'tasks' | 'help';
  args?: string;
}

export function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) return null;

  const parts = input.slice(1).split(' ');
  const cmd = parts[0];
  const args = parts.slice(1).join(' ').trim();

  switch (cmd) {
    case 'exit':
    case 'quit':
      return { type: 'exit' };
    case 'model':
      return { type: 'model', args };
    case 'tools':
      return { type: 'tools' };
    case 'tasks':
      return { type: 'tasks' };
    case 'help':
      return { type: 'help' };
    default:
      return null;
  }
}
