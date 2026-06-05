import { Interface } from 'readline';
import { GRAY, RESET, CYAN } from './renderer.js';
import { showInputTopBorder, coloredPrompt } from './renderer.js';

/**
 * Interactive command history search.
 * Type to filter, Up/Down to navigate, Enter to select, Esc to cancel.
 */
export async function searchHistory(commandHistory: string[], rl: Interface): Promise<void> {
  console.log('\n' + GRAY + '─'.repeat(40) + RESET);
  console.log(CYAN + 'History Search (type to filter, Enter to select, Esc to cancel)' + RESET);

  let filter = '';
  let selected = 0;

  const render = () => {
    const matches = commandHistory
      .filter(h => h.toLowerCase().includes(filter.toLowerCase()))
      .reverse()
      .slice(0, 10);

    console.log('\x1b[2J\x1b[H'); // Clear screen
    console.log(GRAY + 'Filter: ' + RESET + filter + GRAY + '_' + RESET);
    console.log(GRAY + '─'.repeat(40) + RESET);

    matches.forEach((h, i) => {
      const prefix = i === selected ? '> ' : '  ';
      const line = i === selected ? `\x1b[7m${h}\x1b[0m` : h;
      console.log(prefix + line);
    });

    if (matches.length === 0) {
      console.log(GRAY + '(no matches)' + RESET);
    }
  };

  render();

  return new Promise((resolve) => {
    const onData = (data: Buffer) => {
      const str = data.toString();

      // Escape to cancel
      if (str === '\x1b') {
        process.stdin.removeListener('data', onData);
        console.clear();
        showInputTopBorder();
        rl.setPrompt(coloredPrompt());
        rl.prompt(true);
        resolve();
        return;
      }

      // Enter to select
      if (str === '\r' || str === '\n') {
        process.stdin.removeListener('data', onData);
        const matches = commandHistory
          .filter(h => h.toLowerCase().includes(filter.toLowerCase()))
          .reverse();
        if (matches[selected]) {
          rl.write(matches[selected]);
        }
        console.clear();
        showInputTopBorder();
        rl.setPrompt(coloredPrompt());
        rl.prompt(true);
        resolve();
        return;
      }

      // Backspace
      if (str === '\x7f') {
        filter = filter.slice(0, -1);
        selected = 0;
        render();
        return;
      }

      // Up/Down arrows
      if (str.startsWith('\x1b[')) {
        const matches = commandHistory
          .filter(h => h.toLowerCase().includes(filter.toLowerCase()))
          .reverse();
        if (str === '\x1b[A') { // Up
          selected = Math.max(0, selected - 1);
        } else if (str === '\x1b[B') { // Down
          selected = Math.min(matches.length - 1, selected + 1);
        }
        render();
        return;
      }

      // Regular character
      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        filter += str;
        selected = 0;
        render();
      }
    };

    process.stdin.on('data', onData);
  });
}
