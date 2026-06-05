import { Interface } from 'readline';
import { CYAN, RESET, GRAY } from './renderer.js';
import { getTermWidth } from './renderer.js';

/**
 * Show an interactive arrow-key permission prompt.
 * Returns whether the user allowed the operation, and whether the assistant box was closed.
 */
export async function promptPermission(
  toolName: string,
  detail: string,
  rl: Interface
): Promise<{ allowed: boolean; boxClosed: boolean }> {
  // Close the assistant box before asking permission so the prompt
  // doesn't appear inside the box and corrupt the UI.
  const width = getTermWidth();
  const assistantBot = '└' + '─'.repeat(width - 2) + '┘';
  process.stdout.write('\n' + CYAN + assistantBot + RESET + '\n\n');

  // Use raw mode on stdin directly (readline is already paused) for arrow-key menu.
  const wasRaw = process.stdin.isRaw;
  if (!wasRaw && process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  const question = `Allow ${toolName} on "${detail}"?`;
  const options = ['Yes', 'No'];
  let selected = 0;

  const render = () => {
    process.stdout.write('\x1b[3A\x1b[J');
    console.log(question);
    const line = options
      .map((opt, i) => (i === selected ? `\x1b[7m ${opt} \x1b[0m` : ` ${opt} `))
      .join('   ');
    console.log(line);
    console.log('');
  };

  console.log(question);
  console.log(
    options
      .map((opt, i) => (i === 0 ? `\x1b[7m ${opt} \x1b[0m` : ` ${opt} `))
      .join('   ')
  );
  console.log('');

  return new Promise((resolve) => {
    const cleanup = (result: boolean) => {
      process.stdin.removeListener('data', onData);
      if (!wasRaw && process.stdin.isTTY) {
        try { process.stdin.setRawMode(false); } catch { /* ignore */ }
      }
      setImmediate(() => {
        if (result) {
          console.log(`\x1b[90m  ✓ 已授权 ${toolName}，正在执行...\x1b[0m`);
        } else {
          console.log(`\x1b[90m  ✗ 已拒绝 ${toolName}\x1b[0m`);
        }
        rl.resume();
      });
      resolve({ allowed: result, boxClosed: true });
    };

    const onData = (data: Buffer) => {
      const byte = data[0];

      if (byte === 3) {
        // Ctrl+C during permission prompt — deny and return to prompt
        cleanup(false);
        return;
      }

      if (byte === 13 || byte === 10) {
        cleanup(selected === 0);
        return;
      }

      // Arrow keys: ESC [ D (left) or ESC [ C (right)
      if (byte === 27 && data[1] === 91) {
        const code = data[2];
        if (code === 68) {
          selected = Math.max(selected - 1, 0);
          render();
        } else if (code === 67) {
          selected = Math.min(selected + 1, options.length - 1);
          render();
        }
        return;
      }

      const ch = data.toString().trim().toLowerCase();
      if (ch === 'y') {
        cleanup(true);
      } else if (ch === 'n') {
        cleanup(false);
      }
    };

    process.stdin.on('data', onData);
  });
}
