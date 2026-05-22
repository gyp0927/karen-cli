const BOX_H = '─';
const BOX_V = '│';
const BOX_TL = '┌';
const BOX_TR = '┐';
const BOX_BL = '└';
const BOX_BR = '┘';

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  const rawLines = text.split('\n');

  for (const raw of rawLines) {
    if (raw.length <= width - 4) {
      lines.push(raw);
      continue;
    }

    let current = '';
    for (const char of raw) {
      if ((current + char).length > width - 4) {
        lines.push(current);
        current = char;
      } else {
        current += char;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

export function printFrame(text: string, title?: string, color?: string): void {
  const cols = process.stdout.columns || 80;
  const width = Math.max(40, Math.min(cols - 2, 100));

  const colorCode = color || '\x1b[36m';
  const reset = '\x1b[0m';

  const lines = wrapText(text, width);

  let top = BOX_TL + BOX_H.repeat(width - 2) + BOX_TR;
  if (title) {
    const pad = width - 2 - title.length - 4;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    top = BOX_TL + BOX_H.repeat(left) + ' ' + title + ' ' + BOX_H.repeat(right) + BOX_TR;
  }

  console.log(colorCode + top + reset);
  for (const line of lines) {
    const pad = width - 4 - line.length;
    console.log(colorCode + BOX_V + ' ' + line + ' '.repeat(Math.max(0, pad)) + ' ' + BOX_V + reset);
  }
  console.log(colorCode + BOX_BL + BOX_H.repeat(width - 2) + BOX_BR + reset);
}

export function printStreamChunk(chunk: string, color?: string): void {
  process.stdout.write(color || '\x1b[37m');
  process.stdout.write(chunk);
  process.stdout.write('\x1b[0m');
}

export function printUserInput(text: string): void {
  const cols = process.stdout.columns || 80;
  const width = Math.max(40, Math.min(cols - 2, 100));
  const colorCode = '\x1b[1;34m';
  const reset = '\x1b[0m';
  const prefix = 'You';
  const line = BOX_V + ' ' + prefix + ' ' + BOX_H.repeat(width - 4 - prefix.length) + ' ' + BOX_V;
  console.log(colorCode + line + reset);
  const textLines = text.split('\n');
  for (const t of textLines) {
    const pad = width - 4 - t.length;
    console.log(colorCode + BOX_V + ' ' + t + ' '.repeat(Math.max(0, pad)) + ' ' + BOX_V + reset);
  }
}
