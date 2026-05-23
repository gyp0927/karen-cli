export interface ParsedCommand {
  type: 'exit' | 'model' | 'cost' | 'tools' | 'skills' | 'skill_install' | 'skill_remove' | 'tasks' | 'remember' | 'forget' | 'memory' | 'plan' | 'help';
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
    case 'cost':
      return { type: 'cost' };
    case 'tools':
      return { type: 'tools' };
    case 'skills':
      return { type: 'skills' };
    case 'skill': {
      const subCmd = parts[1];
      const subArgs = parts.slice(2).join(' ').trim();
      if (subCmd === 'install') {
        return { type: 'skill_install', args: subArgs };
      }
      if (subCmd === 'remove') {
        return { type: 'skill_remove', args: subArgs };
      }
      // Fallback to listing skills
      return { type: 'skills' };
    }
    case 'tasks':
      return { type: 'tasks' };
    case 'remember':
      return { type: 'remember', args };
    case 'forget':
      return { type: 'forget', args };
    case 'memory':
      return { type: 'memory', args };
    case 'plan':
      return { type: 'plan', args };
    case 'help':
      return { type: 'help' };
    default:
      return null;
  }
}
