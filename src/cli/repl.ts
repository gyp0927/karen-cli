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
      prompt: '> ',
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
        try {
          const response = await this.loop.run(input);
          console.log(response);
        } catch (err) {
          Logger.error(`Error: ${(err as Error).message}`);
        }
      }

      if (this.running) {
        this.rl.prompt();
      }
    }

    this.rl.close();
  }

  private async handleCommand(cmd: ReturnType<typeof parseCommand>): Promise<void> {
    if (!cmd) return;
    switch (cmd.type) {
      case 'help':
        console.log('Commands: /exit, /model <name>, /tools, /tasks, /help');
        break;
      case 'model':
        console.log(`Model switching not yet implemented. Requested: ${cmd.args}`);
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
