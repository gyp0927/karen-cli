import { IProvider } from '../core/types.js';

const KAREN_ASCII = `
██╗  ██╗ █████╗ ██████╗ ███████╗███╗   ██╗
██║ ██╔╝██╔══██╗██╔══██╗██╔════╝████╗  ██║
█████╔╝ ███████║██████╔╝█████╗  ██╔██╗ ██║
██╔═██╗ ██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║
██║  ██╗██║  ██║██║  ██║███████╗██║ ╚████║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝
`;

export function printBanner(provider: IProvider, version: string): void {
  const cols = process.stdout.columns || 80;
  const width = Math.max(60, Math.min(cols - 2, 100));

  const artLines = KAREN_ASCII.split('\n').filter(l => l.length > 0);
  const maxArtWidth = Math.max(...artLines.map(l => l.length));

  const boxTop = '┌' + '─'.repeat(width - 2) + '┐';
  const boxSep = '├' + '─'.repeat(width - 2) + '┤';
  const boxBot = '└' + '─'.repeat(width - 2) + '┘';

  console.log('');
  console.log(boxTop);

  // Center ASCII art
  for (const line of artLines) {
    const pad = width - 2 - line.length;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    console.log('│' + ' '.repeat(left) + line + ' '.repeat(right) + '│');
  }

  console.log(boxSep);

  const title = `karen-cli v${version}`;
  const subtitle = 'Model makes decisions, Harness executes';
  console.log(centerLine(title, width));
  console.log(centerLine(subtitle, width));

  console.log(boxSep);

  const model = (provider as unknown as Record<string, string>)?.model || 'default';
  console.log(centerLine(`Provider: ${provider.name}`, width));
  console.log(centerLine(`Model: ${model}`, width));
  console.log(centerLine(`Working directory: ${process.cwd()}`, width));

  console.log(boxSep);
  console.log(centerLine('Commands:', width));
  console.log(centerLine('/exit     Quit the session', width));
  console.log(centerLine('/model    Show current provider', width));
  console.log(centerLine('/tools    List available tools', width));
  console.log(centerLine('/tasks    Show task graph', width));
  console.log(centerLine('/help     Show help', width));

  console.log(boxBot);
  console.log('');
}

function centerLine(text: string, width: number): string {
  const pad = width - 2 - text.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return '│' + ' '.repeat(left) + text + ' '.repeat(right) + '│';
}
