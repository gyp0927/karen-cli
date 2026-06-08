import { Interface } from 'readline';
import { AgentLoop } from '../core/loop.js';
import { MODES } from '../core/modes.js';

const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[1;32m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[1;34m';
const YELLOW = '\x1b[1;33m';

export { GRAY, RESET, GREEN, CYAN, BLUE, YELLOW };

/** Return the terminal display width of a single Unicode codepoint. */
export function charWidth(char: string): number {
  const cp = char.codePointAt(0) || 0;
  // Zero-width / combining characters
  if (cp === 0 || cp === 0x034F ||
      (cp >= 0x200B && cp <= 0x200F) ||
      (cp >= 0x2028 && cp <= 0x202E) ||
      (cp >= 0x2060 && cp <= 0x2063) ||
      (cp >= 0xFE00 && cp <= 0xFE0F) ||
      (cp >= 0xE0100 && cp <= 0xE01EF)) {
    return 0;
  }
  // East-Asian wide / fullwidth / emoji ranges
  if ((cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2329 && cp <= 0x232A) ||
      (cp >= 0x2E80 && cp <= 0x303E) ||
      (cp >= 0x3040 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE10 && cp <= 0xFE19) ||
      (cp >= 0xFE30 && cp <= 0xFE6F) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||
      (cp >= 0x1F300 && cp <= 0x1F9FF) ||
      (cp >= 0x1FA00 && cp <= 0x1FA6F) ||
      (cp >= 0x20000 && cp <= 0x2FFFD) ||
      (cp >= 0x30000 && cp <= 0x3FFFD)) {
    return 2;
  }
  return 1;
}

/** Sum of display widths for a whole string. */
export function displayWidth(str: string): number {
  let w = 0;
  for (const ch of str) w += charWidth(ch);
  return w;
}

/** Get the usable terminal width for boxes. */
export function getTermWidth(): number {
  const cols = process.stdout.columns || 80;
  return Math.max(40, Math.min(cols - 2, 100));
}

/** Show the top border line for the input area. */
export function showInputTopBorder(): void {
  const width = getTermWidth();
  console.log(GRAY + '─'.repeat(width) + RESET);
}

/** Show the bottom border line for the input area. */
export function showInputBottomBorder(): void {
  const width = getTermWidth();
  console.log(GRAY + '─'.repeat(width) + RESET);
}

/** Clear the input area (top border + prompt + input + bottom border). */
export function clearInputArea(rl: Interface): void {
  const prompt = rl.getPrompt();
  const line = rl.line || '';
  const cols = process.stdout.columns || 80;
  const fullWidth = displayWidth(prompt) + displayWidth(line);
  const inputLines = Math.max(1, Math.ceil(fullWidth / cols));
  const totalLines = inputLines + 2;
  for (let i = 0; i < totalLines; i++) {
    process.stdout.write('\x1b[1A\x1b[2K');
  }
}

/** Build the colored prompt string. */
export function coloredPrompt(): string {
  return GREEN + '❯' + RESET + ' ';
}

/** Build the status bar string with mode, provider, tokens, cost. */
export function buildStatusBar(loop: AgentLoop): string {
  const mode = MODES[loop.getMode()];
  const info = loop.getProviderInfo();
  const ct = loop.getCostTracker();
  const tokens = ct?.totalTokens();
  const cost = ct?.sessionCost();
  const dirName = process.cwd().split(/[/\\]/).pop() || process.cwd();

  const colors: Record<string, string> = { chat: '36', code: '32', agent: '33', plan: '35' };
  const c = colors[loop.getMode()] || '37';

  const pill = `\x1b[${c}m ${mode.emoji} ${mode.name} \x1b[0m`;

  const parts: string[] = [];
  parts.push(`\x1b[90m📁 ${dirName}\x1b[0m`);
  parts.push(`\x1b[90m⚡ ${info.name}\x1b[0m`);
  if (tokens && tokens.total > 0) {
    parts.push(`\x1b[90m🔤 ${tokens.total.toLocaleString()}\x1b[0m`);
    if (cost !== undefined && cost > 0) parts.push(`\x1b[90m💰 $${cost.toFixed(2)}\x1b[0m`);
  }
  const right = parts.join(' \x1b[90m│\x1b[0m ');

  return pill + ' \x1b[90m│\x1b[0m ' + right;
}

/** Draw a box with given title, lines, and color. */
export function drawBox(lines: string[], title: string, color: string): void {
  const width = getTermWidth();
  const titlePad = title ? title.length + 4 : 0;
  const top = '┌' + '─'.repeat(4) + title + '─'.repeat(Math.max(2, width - 6 - titlePad)) + '┐';
  const bot = '└' + '─'.repeat(width - 2) + '┘';

  console.log('');
  console.log(color + top + RESET);
  for (const line of lines) {
    const pad = width - 4 - displayWidth(line);
    console.log(color + '│ ' + line + ' '.repeat(Math.max(0, pad)) + ' │' + RESET);
  }
  console.log(color + bot + RESET);
  console.log('');
}

/** Draw the user input box. */
export function drawUserBox(input: string): void {
  const width = getTermWidth();
  const top = '┌' + '─'.repeat(4) + ' You ' + '─'.repeat(width - 11) + '┐';
  const bot = '└' + '─'.repeat(width - 2) + '┘';

  console.log('');
  console.log(BLUE + top + RESET);
  for (const line of input.split('\n')) {
    const pad = width - 4 - displayWidth(line);
    console.log(BLUE + '│ ' + line + ' '.repeat(Math.max(0, pad)) + ' │' + RESET);
  }
  console.log(BLUE + bot + RESET);
  console.log('');
}

/** Draw the assistant box top border. */
export function drawAssistantTop(): void {
  const width = getTermWidth();
  const top = '┌' + '─'.repeat(4) + ' Assistant ' + '─'.repeat(width - 15) + '┐';
  console.log(CYAN + top + RESET);
  process.stdout.write(CYAN + '│ ' + RESET);
}

/** Draw the assistant box bottom border. */
export function drawAssistantBot(): void {
  const width = getTermWidth();
  const bot = '└' + '─'.repeat(width - 2) + '┘';
  console.log(CYAN + bot + RESET);
}

/** Pad and close the current assistant box line. */
export function closeAssistantLine(lineLength: number, hasContent: boolean): void {
  if (!hasContent) return;
  const width = getTermWidth();
  const maxLine = width - 4;
  const pad = maxLine - lineLength;
  process.stdout.write(' '.repeat(Math.max(0, pad)) + CYAN + ' │' + RESET);
}

/** Draw the tool-use box top border. */
export function drawToolUseTop(toolName: string, detail: string): void {
  const width = getTermWidth();
  const title = ` 🔧 ${toolName} `;
  const subtitle = detail ? `  ${detail} ` : '';
  const totalTitleLen = title.length + subtitle.length;
  const top = '┌' + '─'.repeat(4) + title + '─'.repeat(Math.max(2, width - 6 - totalTitleLen)) + '┐';
  console.log('');
  console.log(YELLOW + top + RESET);
  process.stdout.write(YELLOW + '│' + RESET);
}

/** Draw the tool-use box bottom border. */
export function drawToolUseBot(): void {
  const width = getTermWidth();
  const bot = '└' + '─'.repeat(width - 2) + '┘';
  console.log(YELLOW + bot + RESET);
  console.log('');
}
