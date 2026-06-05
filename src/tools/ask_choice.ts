import { Tool, ToolResult } from '../core/types.js';
import { emitKeypressEvents } from 'readline';

export interface ChoiceOption {
  id: string;
  title: string;
  summary?: string;
}

/**
 * Present an arrow-key menu to the user and return their choice.
 * Used by the model when it needs the user to pick between alternatives.
 */
export function presentChoice(
  question: string,
  options: ChoiceOption[],
  allowCustom = false
): Promise<string | null> {
  return new Promise((resolve) => {
    let selected = 0;
    const stdin = process.stdin;
    const stdout = process.stdout;

    const wasRaw = stdin.isRaw;
    if (!wasRaw) stdin.setRawMode(true);
    emitKeypressEvents(stdin);

    function render() {
      stdout.write('\x1b[2J\x1b[H'); // clear screen
      stdout.write(`\x1b[1;36m? ${question}\x1b[0m\n\n`);
      for (let i = 0; i < options.length; i++) {
        const prefix = i === selected ? '\x1b[1;37;44m > ' : '   ';
        const suffix = i === selected ? ' \x1b[0m' : '';
        stdout.write(`${prefix}${options[i].title}${suffix}\n`);
        if (options[i].summary) {
          stdout.write(`     \x1b[90m${options[i].summary}\x1b[0m\n`);
        }
      }
      if (allowCustom) {
        stdout.write(`\n   \x1b[90m... or type your own answer\x1b[0m\n`);
      }
      stdout.write(`\n\x1b[90m↑↓ to move · Enter to select · Esc to cancel\x1b[0m\n`);
    }

    function cleanup() {
      try { if (!wasRaw) stdin.setRawMode(false); } catch {}
      stdin.removeListener('keypress', onKeypress);
    }

    const onKeypress = (_str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') { cleanup(); resolve(null); return; }
      if (key.name === 'up') { selected = Math.max(0, selected - 1); render(); return; }
      if (key.name === 'down') { selected = Math.min(options.length - 1, selected + 1); render(); return; }
      if (key.name === 'return' || key.name === 'enter') { cleanup(); resolve(options[selected].id); return; }
      if (key.name === 'escape') { cleanup(); resolve(null); return; }
    };

    stdin.on('keypress', onKeypress);
    render();
  });
}

export function createAskChoiceTool(showChoice?: (q: string, opts: ChoiceOption[], custom: boolean) => Promise<string | null>): Tool {
  const presenter = showChoice || presentChoice;

  return {
    name: 'ask_choice',
    description: 'Ask the user to pick from a list of options using an arrow-key menu. Use this when you need the user to decide between multiple approaches, or when you need clarification before proceeding. Max 6 options.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the user (one sentence).' },
        options: {
          type: 'array',
          description: '2-6 alternatives for the user to pick from.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stable identifier for this option (e.g. "A", "fix-all", "skip").' },
              title: { type: 'string', description: 'Short label shown to the user.' },
              summary: { type: 'string', description: 'Optional longer description shown below the title.' },
            },
            required: ['id', 'title'],
          },
        },
        allow_custom: { type: 'boolean', description: 'If true, lets the user type their own answer instead of picking.' },
      },
      required: ['question', 'options'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const question = String(args.question || 'Choose an option:');
      const rawOptions = Array.isArray(args.options) ? args.options.slice(0, 6) : [];
      const allowCustom = args.allow_custom === true;

      if (rawOptions.length < 2) {
        return { success: false, output: '', error: 'Need at least 2 options.' };
      }

      const options: ChoiceOption[] = rawOptions.map((o: unknown) => {
        const obj = o as Record<string, unknown>;
        return { id: String(obj.id || ''), title: String(obj.title || ''), summary: obj.summary ? String(obj.summary) : undefined };
      });

      const choice = await presenter(question, options, allowCustom);
      if (!choice) {
        return { success: true, output: 'User cancelled the choice.' };
      }

      const chosen = options.find(o => o.id === choice);
      const label = chosen ? `"${chosen.title}" (${chosen.id})` : choice;
      return { success: true, output: `User selected: ${label}` };
    },
  };
}
