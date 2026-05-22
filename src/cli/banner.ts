import { IProvider } from '../core/types.js';

const KAREN_ASCII = `
    ██╗  ██╗ █████╗ ██████╗ ███████╗███╗   ██╗
    ██║ ██╔╝██╔══██╗██╔══██╗██╔════╝████╗  ██║
    █████╔╝ ███████║██████╔╝█████╗  ██╔██╗ ██║
    ██╔═██╗ ██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║
    ██║  ██╗██║  ██║██║  ██║███████╗██║ ╚████║
    ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝
`;

function boxLine(text: string, width: number): string {
  const pad = Math.max(0, width - text.length - 2);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return '│' + ' '.repeat(left) + text + ' '.repeat(right) + '│';
}

function separator(width: number): string {
  return '├' + '─'.repeat(width - 2) + '┤';
}

function topBorder(width: number): string {
  return '┌' + '─'.repeat(width - 2) + '┐';
}

function bottomBorder(width: number): string {
  return '└' + '─'.repeat(width - 2) + '┘';
}

export function printBanner(provider: IProvider, version: string): void {
  const width = 56;
  const lines: string[] = [];

  lines.push(topBorder(width));

  // ASCII art lines (centered roughly)
  const artLines = KAREN_ASCII.split('\n').filter(l => l.length > 0);
  for (const line of artLines) {
    const trimmed = line.trimStart();
    lines.push(boxLine(trimmed, width));
  }

  lines.push(separator(width));
  lines.push(boxLine(`karen-cli v${version}`, width));
  lines.push(boxLine('Model makes decisions, Harness executes', width));
  lines.push(separator(width));

  // Provider info
  const model = (provider as unknown as Record<string, string>)?.model || 'default';
  lines.push(boxLine(`Provider: ${provider.name}`, width));
  if (model) {
    lines.push(boxLine(`Model: ${model}`, width));
  }
  lines.push(boxLine(`Working directory: ${process.cwd()}`, width));
  lines.push(separator(width));

  // Tips
  lines.push(boxLine('Commands:', width));
  lines.push(boxLine('  /exit     Quit the session', width));
  lines.push(boxLine('  /model    Show current provider', width));
  lines.push(boxLine('  /tools    List available tools', width));
  lines.push(boxLine('  /tasks    Show task graph', width));
  lines.push(boxLine('  /help     Show help', width));

  lines.push(bottomBorder(width));

  console.log(lines.join('\n'));
}
