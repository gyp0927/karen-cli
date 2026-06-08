import { createInterface, Interface, emitKeypressEvents } from 'readline';
import { AgentLoop } from '../core/loop.js';
import { parseCommand } from './commands.js';
import { handleCommand } from './handlers.js';
import { SkillManager } from '../skills/manager.js';
import { MemoryManager } from '../memory/manager.js';
import { PlanManager } from '../plan/manager.js';
import { isBashDangerous, SENSITIVE_TOOLS } from '../permissions/policies.js';
import { MODES } from '../core/modes.js';
import { Message } from '../core/types.js';
import {
  charWidth, displayWidth, getTermWidth,
  showInputTopBorder, showInputBottomBorder, clearInputArea,
  coloredPrompt, buildStatusBar,
  drawUserBox, drawAssistantTop, drawAssistantBot, closeAssistantLine,
  drawToolUseTop, drawToolUseBot,
  GRAY, RESET, CYAN, BLUE,
} from './renderer.js';
import { searchHistory } from './history-search.js';
import { promptPermission } from './permission-prompt.js';

function getReadlineLine(rl: Interface): string {
  return rl.line || '';
}

/** Replace entire readline line content without using private APIs. */
function replaceLine(rl: Interface, newContent: string): void {
  process.stdout.write('\r\x1b[2K');
  rl.setPrompt(coloredPrompt());
  rl.write(newContent);
}

export interface ReplOptions {
  loop: AgentLoop;
  onSwitchProvider?: (name: string) => boolean | Promise<boolean>;
  skillManager?: SkillManager;
  memoryManager?: MemoryManager;
  planManager?: PlanManager;
  enablePermissionChecks?: boolean;
}

export class Repl {
  private rl: Interface;
  private loop: AgentLoop;
  private running = true;
  private onSwitchProvider?: (name: string) => boolean | Promise<boolean>;
  private skillManager?: SkillManager;
  private memoryManager?: MemoryManager;
  private planManager?: PlanManager;
  private history: Message[] = [];
  private activeToolTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private activeToolSpinners: Map<string, number> = new Map();
  private toolOutputBuffer: string = '';
  private boxWasClosed = false;
  private commandHistory: string[] = [];
  private historyIndex = -1;

  constructor(options: ReplOptions) {
    this.loop = options.loop;
    this.onSwitchProvider = options.onSwitchProvider;
    this.skillManager = options.skillManager;
    this.memoryManager = options.memoryManager;
    this.planManager = options.planManager;
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line: string) => {
        if (!line.startsWith('/')) return [[], line];
        const cmds = [
          '/exit', '/model', '/cost', '/tools', '/skills', '/tasks',
          '/remember', '/forget', '/memory', '/plan', '/diff',
          '/resume', '/rollback', '/help',
        ];
        const hits = cmds.filter(c => c.startsWith(line));
        return [hits.length > 0 ? hits : cmds, line];
      },
    });

    if (options.enablePermissionChecks !== false) {
      this.loop.onNeedPermission = this.handlePermissionRequest.bind(this);
    }
    this.loop.onToolStart = this.handleToolStart.bind(this);
    this.loop.onToolEnd = this.handleToolEnd.bind(this);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      let processing = false;
      const queue: string[] = [];

      // Show status bar
      console.log(buildStatusBar(this.loop));

      const processNext = async () => {
        if (processing || queue.length === 0) return;
        processing = true;
        const input = queue.shift()!.trim();

        if (input) {
          // Save to history
          if (this.commandHistory.length === 0 || this.commandHistory[this.commandHistory.length - 1] !== input) {
            this.commandHistory.push(input);
            if (this.commandHistory.length > 200) this.commandHistory.shift();
          }
          this.historyIndex = -1;

          const cmd = parseCommand(input);
          if (cmd) {
            if (cmd.type === 'exit') {
              this.running = false;
              this.rl.close();
              resolve();
              return;
            }
            await this.handleCommand(cmd, input);
          } else {
            await this.handleInput(input);
          }
        }

        processing = false;
        if (this.running) {
          if (input) showInputTopBorder();
          this.rl.setPrompt(coloredPrompt());
          this.rl.prompt();
          processNext();
        }
      };

      this.rl.on('line', (line) => {
        process.stdout.write('\x1b[1B\x1b[2K\x1b[1A');
        if (line.trim()) {
          showInputBottomBorder();
        }
        queue.push(line);
        processNext();
      });

      this.rl.on('close', () => {
        this.running = false;
        resolve();
      });

      const CMDS = [
        '/exit', '/model', '/cost', '/tools', '/skills', '/tasks',
        '/remember', '/forget', '/memory', '/plan', '/diff',
        '/resume', '/rollback', '/help',
      ];

      emitKeypressEvents(process.stdin);
      const keypressHandler = (_str: string, key: { name?: string; shift?: boolean; ctrl?: boolean; sequence?: string }) => {
        const line = getReadlineLine(this.rl);
        if (line.startsWith('/') && !line.includes(' ') && key.name !== 'return' && key.name !== 'enter') {
          const matches = CMDS.filter(c => c.startsWith(line) && c !== line);
          process.stdout.write('\x1b[s');
          process.stdout.write('\x1b[1B');
          process.stdout.write('\x1b[2K');
          process.stdout.write('\x1b[90m' + (matches.length > 0 ? matches.join('  ') : CMDS.join('  ')) + '\x1b[0m');
          process.stdout.write('\x1b[u');
        }

        if (key.ctrl && key.name === 'r') {
          this.searchHistory();
          return;
        }

        if (key.ctrl && key.name === 'l') {
          console.clear();
          showInputTopBorder();
          this.rl.setPrompt(coloredPrompt());
          this.rl.prompt(true);
          return;
        }

        if (key.name === 'tab' && key.shift) {
          const newMode = this.loop.nextMode();
          const modeInfo = MODES[newMode];
          process.stdout.write('\r\x1b[2K');
          console.log(`\x1b[1;33m⚡ ${modeInfo.emoji} ${modeInfo.name}  ${modeInfo.description}\x1b[0m`);
          console.log('  ' + buildStatusBar(this.loop));
          showInputTopBorder();
          this.rl.setPrompt(coloredPrompt());
          this.rl.prompt(true);
          return;
        }

        if (key.name === 'up') {
          if (this.commandHistory.length === 0) return;
          if (this.historyIndex === -1) this.historyIndex = this.commandHistory.length;
          if (this.historyIndex > 0) this.historyIndex--;
          const entry = this.commandHistory[this.historyIndex] || '';
          replaceLine(this.rl, entry);
          return;
        }

        if (key.name === 'down') {
          if (this.historyIndex === -1) return;
          this.historyIndex++;
          if (this.historyIndex >= this.commandHistory.length) {
            this.historyIndex = -1;
            replaceLine(this.rl, '');
            return;
          }
          const entry = this.commandHistory[this.historyIndex] || '';
          replaceLine(this.rl, entry);
          return;
        }
      };
      process.stdin.on('keypress', keypressHandler);

      const onSignal = () => {
        this.running = false;
        this.rl.close();
        process.stdin.removeListener('keypress', keypressHandler);
        console.log('\n\x1b[90mGoodbye!\x1b[0m');
        // Graceful shutdown — resolve the promise instead of hard exit
        resolve();
      };
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);

      // Also remove keypress listener when readline closes normally
      this.rl.on('close', () => {
        process.stdin.removeListener('keypress', keypressHandler);
      });

      console.log('');
      showInputTopBorder();
      this.rl.setPrompt(coloredPrompt());
      this.rl.prompt();
    });
  }

  private async searchHistory(): Promise<void> {
    this.rl.pause();
    await searchHistory(this.commandHistory, this.rl);
  }

  private async handleInput(input: string): Promise<void> {
    this.boxWasClosed = false;
    clearInputArea(this.rl);

    const width = getTermWidth();
    const maxLine = width - 4;
    const userColor = BLUE;
    const assistantColor = CYAN;
    const reset = RESET;

    // User input box
    drawUserBox(input);

    // Assistant box with streaming
    drawAssistantTop();

    let lineLength = 0;
    let fullContent = '';
    let hasShownThinking = true;
    let hasVisibleContentOnLine = false;

    const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinnerIdx = 0;
    const spinnerTimer = setInterval(() => {
      process.stdout.write('\r\x1b[2K' + assistantColor + '│ ' + reset + `\x1b[90m${spinner[spinnerIdx]}\x1b[0m Thinking...`);
      spinnerIdx = (spinnerIdx + 1) % spinner.length;
    }, 120);
    lineLength = displayWidth('Thinking...') + 2;

    this.rl.pause();

    try {
      const { content, usage } = await this.loop.run(
        input,
        (chunk: string) => {
          if (hasShownThinking && chunk.length > 0) {
            clearInterval(spinnerTimer);
            process.stdout.write('\r\x1b[2K' + assistantColor + '│ ' + reset);
            lineLength = 0;
            hasShownThinking = false;
            hasVisibleContentOnLine = false;
          }

          fullContent += chunk;

          let buffer = '';
          for (const char of chunk) {
            if (char === '\r') continue;

            if (char === '\n') {
              if (buffer.length > 0) {
                process.stdout.write(buffer);
                buffer = '';
              }

              if (!hasVisibleContentOnLine) {
                continue;
              }
              const pad = maxLine - lineLength;
              process.stdout.write(' '.repeat(Math.max(0, pad)) + assistantColor + ' │' + reset + '\n');
              process.stdout.write(assistantColor + '│ ' + reset);
              lineLength = 0;
              hasVisibleContentOnLine = false;
            } else {
              const cw = charWidth(char);
              if (lineLength + cw > maxLine) {
                if (buffer.length > 0) {
                  process.stdout.write(buffer);
                  buffer = '';
                }
                process.stdout.write(assistantColor + ' │' + reset + '\n');
                process.stdout.write(assistantColor + '│ ' + reset);
                lineLength = 0;
              }
              buffer += char;
              lineLength += cw;
              if (char !== ' ' && char !== '\t') {
                hasVisibleContentOnLine = true;
              }
            }
          }

          if (buffer.length > 0) {
            process.stdout.write(buffer);
          }
        },
        this.history
      );

      this.history.push(
        { role: 'user', content: input },
        { role: 'assistant', content }
      );
      if (this.history.length > 20) {
        this.history = this.history.slice(-20);
      }

      if (!this.boxWasClosed) {
        if (lineLength > 0 && hasVisibleContentOnLine) {
          const pad = maxLine - lineLength;
          process.stdout.write(' '.repeat(Math.max(0, pad)) + assistantColor + ' │' + reset);
        }
        console.log('');
        drawAssistantBot();
        console.log('  ' + buildStatusBar(this.loop));
        console.log('');
      }
    } catch (err) {
      const errColor = '\x1b[1;31m';
      const gray = '\x1b[90m';
      const resetColor = '\x1b[0m';

      clearInterval(spinnerTimer);
      if (hasShownThinking) {
        process.stdout.write('\r\x1b[2K' + assistantColor + '│ ' + resetColor);
        lineLength = 0;
        hasShownThinking = false;
      }

      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write('\n' + assistantColor + '│ ' + errColor + '⚠ ' + msg + resetColor);
      if (!this.boxWasClosed) {
        console.log('');
        drawAssistantBot();
        console.log('');
      }
    } finally {
      this.rl.resume();
    }
  }

  private async handlePermissionRequest(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    const detail = toolName === 'Bash'
      ? String(args.command)
      : String(args.file_path || args.operation || JSON.stringify(args));

    if (!SENSITIVE_TOOLS.includes(toolName)) {
      return true;
    }

    if (toolName === 'Write' || toolName === 'Edit') {
      return true;
    }

    if (toolName === 'Bash' && !isBashDangerous(String(args.command))) {
      return true;
    }

    const { allowed, boxClosed } = await promptPermission(toolName, detail, this.rl);
    if (boxClosed) {
      this.boxWasClosed = true;
    }
    return allowed;
  }

  private handleToolStart(toolName: string, args: Record<string, unknown>): void {
    // Build a concise description
    let detail = '';
    if (toolName === 'Bash') {
      detail = String(args.command || '');
    } else if (toolName === 'Write' || toolName === 'Edit') {
      detail = String(args.file_path || '');
    } else if (toolName === 'Read') {
      detail = String(args.file_path || '');
    } else if (toolName === 'Grep') {
      detail = String(args.pattern || '');
    } else {
      detail = String(args.file_path || args.path || args.operation || JSON.stringify(args).slice(0, 60));
    }
    if (detail.length > 50) detail = detail.slice(0, 50) + '...';

    const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinnerIdx = 0;

    // Print the tool-use box top
    drawToolUseTop(toolName, detail);

    // Start spinner timer
    const timer = setInterval(() => {
      process.stdout.write(`\r\x1b[2K  \x1b[90m${spinner[spinnerIdx]}\x1b[0m \x1b[90mRunning...\x1b[0m`);
      spinnerIdx = (spinnerIdx + 1) % spinner.length;
    }, 120);

    this.activeToolTimers.set(toolName, timer);
    this.activeToolSpinners.set(toolName, spinnerIdx);
  }

  private handleToolEnd(toolName: string, _args: Record<string, unknown>, success: boolean): void {
    const timer = this.activeToolTimers.get(toolName);
    if (timer) {
      clearInterval(timer);
      this.activeToolTimers.delete(toolName);
    }
    this.activeToolSpinners.delete(toolName);

    // Clear the spinner line and close the box
    process.stdout.write('\r\x1b[2K');
    const status = success ? '\x1b[32m✓ Done\x1b[0m' : '\x1b[31m✗ Failed\x1b[0m';
    console.log(`  ${status}`);
    drawToolUseBot();
  }

  private async handleCommand(cmd: ReturnType<typeof parseCommand>, input: string): Promise<void> {
    if (!cmd) return;

    clearInputArea(this.rl);

    const lines = await handleCommand(cmd, {
      loop: this.loop,
      skillManager: this.skillManager,
      memoryManager: this.memoryManager,
      planManager: this.planManager,
      onSwitchProvider: this.onSwitchProvider,
    });

    const width = getTermWidth();
    const gray = GRAY;
    const reset = RESET;

    const sysTop = '┌' + '─'.repeat(4) + ' Command ' + '─'.repeat(width - 13) + '┐';
    const sysBot = '└' + '─'.repeat(width - 2) + '┘';

    console.log('');
    console.log(gray + sysTop + reset);
    for (const line of lines) {
      const pad = width - 4 - displayWidth(line);
      console.log(gray + '│ ' + line + ' '.repeat(Math.max(0, pad)) + ' │' + reset);
    }
    console.log(gray + sysBot + reset);
    console.log('');
  }
}
