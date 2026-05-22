import { createInterface, Interface } from 'readline';
import { AgentLoop } from '../core/loop.js';
import { parseCommand } from './commands.js';
import { Logger } from '../utils/logger.js';

export interface ReplOptions {
  loop: AgentLoop;
}

export class Repl {
  private rl: Interface;
  private loop: AgentLoop;
  private running = true;

  constructor(options: ReplOptions) {
    this.loop = options.loop;
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[1;32m❯\x1b[0m ',
    });
  }

  async start(): Promise<void> {
    this.rl.prompt();

    for await (const line of this.rl) {
      const input = line.trim();
      if (!input) {
        this.rl.prompt();
        continue;
      }

      const cmd = parseCommand(input);
      if (cmd) {
        if (cmd.type === 'exit') {
          this.running = false;
          break;
        }
        await this.handleCommand(cmd);
      } else {
        await this.handleInput(input);
      }

      if (this.running) {
        this.rl.prompt();
      }
    }

    this.rl.close();
  }

  private async handleInput(input: string): Promise<void> {
    const cols = process.stdout.columns || 80;
    const width = Math.max(40, Math.min(cols - 2, 100));
    const userColor = '\x1b[1;34m';
    const assistantColor = '\x1b[36m';
    const reset = '\x1b[0m';

    // User input box
    const userTop = '┌' + '─'.repeat(4) + ' You ' + '─'.repeat(width - 11) + '┐';
    const userBot = '└' + '─'.repeat(width - 2) + '┘';
    console.log('');
    console.log(userColor + userTop + reset);
    for (const line of input.split('\n')) {
      const pad = width - 4 - line.length;
      console.log(userColor + '│ ' + line + ' '.repeat(Math.max(0, pad)) + ' │' + reset);
    }
    console.log(userColor + userBot + reset);
    console.log('');

    // Assistant box with streaming
    const assistantTop = '┌' + '─'.repeat(4) + ' Assistant ' + '─'.repeat(width - 15) + '┐';
    const assistantBot = '└' + '─'.repeat(width - 2) + '┘';
    console.log(assistantColor + assistantTop + reset);
    process.stdout.write(assistantColor + '│ ' + reset);

    let lineLength = 0;
    const maxLine = width - 4;
    let fullContent = '';

    try {
      const response = await this.loop.run(input, (chunk: string) => {
        fullContent += chunk;
        for (const char of chunk) {
          if (char === '\n') {
            const pad = maxLine - lineLength;
            process.stdout.write(' '.repeat(Math.max(0, pad)) + assistantColor + ' │' + reset + '\n');
            process.stdout.write(assistantColor + '│ ' + reset);
            lineLength = 0;
          } else {
            process.stdout.write(char);
            lineLength++;
            if (lineLength >= maxLine) {
              process.stdout.write(assistantColor + ' │' + reset + '\n');
              process.stdout.write(assistantColor + '│ ' + reset);
              lineLength = 0;
            }
          }
        }
      });

      // Pad remaining line
      if (lineLength > 0) {
        const pad = maxLine - lineLength;
        process.stdout.write(' '.repeat(Math.max(0, pad)) + assistantColor + ' │' + reset);
      }
      console.log('');
      console.log(assistantColor + assistantBot + reset);
      console.log('');
    } catch (err) {
      process.stdout.write('\n');
      console.log(assistantColor + assistantBot + reset);
      Logger.error(`Error: ${(err as Error).message}`);
    }
  }

  private async handleCommand(cmd: ReturnType<typeof parseCommand>): Promise<void> {
    if (!cmd) return;
    switch (cmd.type) {
      case 'help':
        console.log('Commands: /exit, /model <name>, /tools, /tasks, /help');
        break;
      case 'model':
        console.log('Model switching not yet implemented.');
        break;
      case 'tools':
        console.log('Tool listing not yet implemented.');
        break;
      case 'tasks':
        console.log('Task listing not yet implemented.');
        break;
    }
  }
}
