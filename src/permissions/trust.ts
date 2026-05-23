import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { emitKeypressEvents } from 'readline';

const TRUSTED_PATH = join(homedir(), '.karen', 'trusted.json');

function loadTrusted(): string[] {
  if (!existsSync(TRUSTED_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(TRUSTED_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveTrusted(paths: string[]): void {
  const dir = join(homedir(), '.karen');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TRUSTED_PATH, JSON.stringify(paths, null, 2), 'utf8');
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

export function isTrusted(cwd: string): boolean {
  const normalized = normalizePath(cwd);
  const trusted = loadTrusted();
  return trusted.some((t) => normalizePath(t) === normalized);
}

export function trustPath(cwd: string): void {
  const trusted = loadTrusted();
  if (!isTrusted(cwd)) {
    trusted.push(cwd);
    saveTrusted(trusted);
  }
}

interface MenuOption {
  label: string;
  value: boolean;
}

async function promptSelect(
  question: string,
  options: MenuOption[],
): Promise<boolean> {
  return new Promise((resolve) => {
    let selected = 0;
    const stdin = process.stdin;
    const stdout = process.stdout;

    // Enable raw mode to capture single keystrokes (arrow keys, Enter)
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    emitKeypressEvents(stdin);

    function render() {
      // Move cursor up to overwrite previous render
      if (process.stdout.rows) {
        // Clear from cursor to end of screen, then redraw
        stdout.write('\x1b[s'); // save cursor
      }

      // Build output
      let out = '\n' + '\x1b[1;33m' + question + '\x1b[0m\n\n';
      for (let i = 0; i < options.length; i++) {
        const prefix = i === selected ? '\x1b[1;34m> ' : '  ';
        const suffix = i === selected ? '\x1b[0m' : '\x1b[0m';
        const color = i === selected ? '\x1b[1;36m' : '\x1b[90m';
        out += `${prefix}${color}${options[i].label}${suffix}\n`;
      }
      out += '\n\x1b[90mPress Enter to confirm · Esc to cancel\x1b[0m\n';
      stdout.write(out);

      if (process.stdout.rows) {
        stdout.write('\x1b[u'); // restore cursor (doesn't work well in all terminals)
      }
    }

    function clearLines(count: number) {
      for (let i = 0; i < count; i++) {
        stdout.write('\x1b[1A'); // move up
        stdout.write('\x1b[2K'); // clear line
      }
    }

    // Initial render
    render();

    const lineCount = options.length + 5; // question + options + hint + padding

    const onKeypress = (_str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }

      if (key.name === 'up') {
        clearLines(lineCount);
        selected = Math.max(0, selected - 1);
        render();
        return;
      }

      if (key.name === 'down') {
        clearLines(lineCount);
        selected = Math.min(options.length - 1, selected + 1);
        render();
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        // Clear the menu and show result
        clearLines(lineCount);
        resolve(options[selected].value);
        return;
      }

      if (key.name === 'escape') {
        cleanup();
        clearLines(lineCount);
        resolve(false);
        return;
      }
    };

    function cleanup() {
      stdin.setRawMode(false);
      stdin.removeListener('keypress', onKeypress);
    }

    stdin.on('keypress', onKeypress);
  });
}

export async function promptTrust(cwd: string): Promise<boolean> {
  if (isTrusted(cwd)) return true;

  // In CI or non-TTY environments, auto-trust to avoid blocking.
  if (!process.stdin.isTTY) {
    trustPath(cwd);
    return true;
  }

  console.log('');
  console.log('\x1b[1;33mAccessing workspace:\x1b[0m');
  console.log(`\x1b[90m${cwd}\x1b[0m`);
  console.log('');
  console.log('Quick safety check: Is this a project you created or one you trust?');
  console.log("If not, take a moment to review what's in this folder first.");
  console.log('');

  const options: MenuOption[] = [
    { label: 'Yes, I trust this folder', value: true },
    { label: 'No, exit', value: false },
  ];

  const ok = await promptSelect('', options);

  if (ok) {
    trustPath(cwd);
    console.log('\x1b[32mTrusted.\x1b[0m\n');
    return true;
  }
  console.log('\x1b[90mExiting.\x1b[0m');
  return false;
}
