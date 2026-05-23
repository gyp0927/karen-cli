import { createInterface, Interface } from 'readline';
import { AgentLoop } from '../core/loop.js';
import { parseCommand } from './commands.js';
import { Logger } from '../utils/logger.js';
import { SkillManager } from '../skills/manager.js';
import { MemoryManager } from '../memory/manager.js';
import { PlanManager } from '../plan/manager.js';
import { DEFAULT_TTL, MemoryType } from '../memory/types.js';
import { isBashDangerous, SENSITIVE_TOOLS } from '../permissions/policies.js';

/** Return the terminal display width of a single Unicode codepoint. */
function charWidth(char: string): number {
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
function displayWidth(str: string): number {
  let w = 0;
  for (const ch of str) w += charWidth(ch);
  return w;
}

export interface ReplOptions {
  loop: AgentLoop;
  onSwitchProvider?: (name: string) => boolean | Promise<boolean>;
  skillManager?: SkillManager;
  memoryManager?: MemoryManager;
  planManager?: PlanManager;
  enablePermissionChecks?: boolean;
}

import { Message } from '../core/types.js';

export class Repl {
  private rl: Interface;
  private loop: AgentLoop;
  private running = true;
  private onSwitchProvider?: (name: string) => boolean | Promise<boolean>;
  private skillManager?: SkillManager;
  private memoryManager?: MemoryManager;
  private planManager?: PlanManager;
  private history: Message[] = [];
  private boxWasClosed = false;

  constructor(options: ReplOptions) {
    this.loop = options.loop;
    this.onSwitchProvider = options.onSwitchProvider;
    this.skillManager = options.skillManager;
    this.memoryManager = options.memoryManager;
    this.planManager = options.planManager;
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (options.enablePermissionChecks !== false) {
      this.loop.onNeedPermission = this.handlePermissionRequest.bind(this);
    }
  }

  private getTermWidth(): number {
    const cols = process.stdout.columns || 80;
    return Math.max(40, Math.min(cols - 2, 100));
  }

  private showInputTopBorder(): void {
    const width = this.getTermWidth();
    const gray = '\x1b[90m';
    const reset = '\x1b[0m';
    console.log(gray + '─'.repeat(width) + reset);
  }

  private showInputBottomBorder(): void {
    const width = this.getTermWidth();
    const gray = '\x1b[90m';
    const reset = '\x1b[0m';
    console.log(gray + '─'.repeat(width) + reset);
  }

  private clearInputArea(): void {
    // Clear bottom border, input+prompt line(s), top border
    // The input may have wrapped across multiple physical terminal lines,
    // so we clear upward until the top border line is gone.
    const prompt = this.rl.getPrompt();
    const line = this.rl.line || '';
    const cols = process.stdout.columns || 80;
    const fullWidth = displayWidth(prompt) + displayWidth(line);
    const inputLines = Math.max(1, Math.ceil(fullWidth / cols));
    // total = top border (1) + inputLines + bottom border (1)
    const totalLines = inputLines + 2;
    for (let i = 0; i < totalLines; i++) {
      process.stdout.write('\x1b[1A\x1b[2K');
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      let processing = false;
      const queue: string[] = [];

      const processNext = async () => {
        if (processing || queue.length === 0) return;
        processing = true;
        const input = queue.shift()!.trim();

        if (input) {
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
          this.showInputTopBorder();
          this.rl.setPrompt('\x1b[1;32m❯\x1b[0m ');
          this.rl.prompt();
          // Process any lines that arrived while we were busy
          setImmediate(processNext);
        }
      };

      this.rl.on('line', (line) => {
        if (line.trim()) {
          this.showInputBottomBorder();
        }
        queue.push(line);
        processNext();
      });

      this.rl.on('close', () => {
        this.running = false;
        resolve();
      });

      // Initial prompt with a blank line before the first border so that
      // the first clearInputArea() doesn't erase the banner bottom line.
      console.log('');
      this.showInputTopBorder();
      this.rl.setPrompt('\x1b[1;32m❯\x1b[0m ');
      this.rl.prompt();
    });
  }

  private async handleInput(input: string): Promise<void> {
    this.boxWasClosed = false;
    // Clear the input area (top border, prompt+input line, bottom border)
    this.clearInputArea();

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
      const pad = width - 4 - displayWidth(line);
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
    let hasShownThinking = true;
    let hasVisibleContentOnLine = false;

    // Static thinking indicator — no animation to avoid cursor races with stream
    const thinkingText = '⏳ Thinking...';
    process.stdout.write(thinkingText);
    lineLength = displayWidth(thinkingText);

    // Prevent user input from interfering with the streaming output
    this.rl.pause();

    try {
      const { content, usage } = await this.loop.run(
        input,
        (chunk: string) => {
          // First real content replaces the thinking line entirely
          if (hasShownThinking && chunk.length > 0) {
            process.stdout.write('\r\x1b[2K' + assistantColor + '│ ' + reset);
            lineLength = 0;
            hasShownThinking = false;
            hasVisibleContentOnLine = false;
          }

          fullContent += chunk;
          for (const char of chunk) {
            // Ignore carriage returns (Windows line endings)
            if (char === '\r') continue;

            if (char === '\n') {
              // If current line has no visible content, skip this newline entirely.
              // This eliminates ALL blank lines — even those with only spaces.
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
                process.stdout.write(assistantColor + ' │' + reset + '\n');
                process.stdout.write(assistantColor + '│ ' + reset);
                lineLength = 0;
                // Keep hasVisibleContentOnLine true — the line had content, wrapping is just display
              }
              process.stdout.write(char);
              lineLength += cw;
              if (char !== ' ' && char !== '\t') {
                hasVisibleContentOnLine = true;
              }
            }
          }
        },
        this.history
      );

      // Save only clean user/assistant pairs — no tool_call or tool-result noise.
      this.history.push(
        { role: 'user', content: input },
        { role: 'assistant', content }
      );
      if (this.history.length > 20) {
        this.history = this.history.slice(-20);
      }

      // Pad remaining line and close the box
      if (!this.boxWasClosed) {
        if (lineLength > 0 && hasVisibleContentOnLine) {
          const pad = maxLine - lineLength;
          process.stdout.write(' '.repeat(Math.max(0, pad)) + assistantColor + ' │' + reset);
        }
        console.log('');
        console.log(assistantColor + assistantBot + reset);
        if (usage) {
          const gray = '\x1b[90m';
          const resetColor = '\x1b[0m';
          console.log(gray + `  Tokens: ${usage.total.toLocaleString()} (prompt ${usage.prompt.toLocaleString()}, completion ${usage.completion.toLocaleString()})` + resetColor);
        }
        console.log('');
      }
    } catch (err) {
      const errColor = '\x1b[1;31m';
      const gray = '\x1b[90m';
      const resetColor = '\x1b[0m';

      // Clear thinking indicator if it's still showing
      if (hasShownThinking) {
        process.stdout.write('\r\x1b[2K' + assistantColor + '│ ' + resetColor);
        lineLength = 0;
        hasShownThinking = false;
      }

      const msg = (err as Error).message;
      // Write error inside the assistant box on a new line
      process.stdout.write('\n' + assistantColor + '│ ' + errColor + '⚠ ' + msg + resetColor);
      if (!this.boxWasClosed) {
        console.log('');
        console.log(assistantColor + assistantBot + reset);
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

    // Auto-allow read-only / harmless tools
    if (!SENSITIVE_TOOLS.includes(toolName)) {
      return true;
    }

    // Write and Edit are core coding assistant operations — auto-approve like Claude Code
    if (toolName === 'Write' || toolName === 'Edit') {
      return true;
    }

    // Bash commands require explicit approval; highlight dangerous ones
    if (toolName === 'Bash' && isBashDangerous(String(args.command))) {
      // Fall through to permission prompt
    }

    // Close the assistant box before asking permission so the prompt
    // doesn't appear inside the box and corrupt the UI.
    const width = this.getTermWidth();
    const assistantColor = '\x1b[36m';
    const reset = '\x1b[0m';
    const assistantBot = '└' + '─'.repeat(width - 2) + '┘';
    process.stdout.write('\n' + assistantColor + assistantBot + reset + '\n\n');
    this.boxWasClosed = true;

    // Disable main readline echo so keystrokes don't leak into the next prompt.
    const wasTerminal = this.rl.terminal;
    (this.rl as any).terminal = false;
    process.stdin.resume();

    const question = `Allow ${toolName} on "${detail}"?`;
    const options = ['Yes', 'No'];
    let selected = 0;

    const render = () => {
      // Move up 3 logical lines (blank, options, question) and clear to end of screen
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
        (this.rl as any).terminal = wasTerminal;
        // Drain any keystrokes that arrived during the prompt so they don't
        // leak into the next readline prompt.
        const drain = () => {
          try {
            const fd = (process.stdin as any).fd;
            if (fd !== undefined) {
              const fs = require('fs');
              const buf = Buffer.alloc(256);
              while (fs.readSync(fd, buf, 0, 256, null) > 0) { /* discard */ }
            }
          } catch {
            // Non-blocking read may fail; ignore
          }
        };
        drain();
        if (result) {
          console.log(`\x1b[90m  ✓ 已授权 ${toolName}，正在执行...\x1b[0m`);
        } else {
          console.log(`\x1b[90m  ✗ 已拒绝 ${toolName}\x1b[0m`);
        }
        this.rl.resume();
        resolve(result);
      };

      const onData = (data: Buffer) => {
        const byte = data[0];

        if (byte === 3) {
          // Ctrl+C
          cleanup(false);
          process.exit(0);
        }

        if (byte === 13 || byte === 10) {
          // Enter / Return
          cleanup(selected === 0);
          return;
        }

        // Arrow keys: ESC [ D (left) or ESC [ C (right)
        if (byte === 27 && data[1] === 91) {
          const code = data[2];
          if (code === 68) {
            // Left
            selected = Math.max(selected - 1, 0);
            render();
          } else if (code === 67) {
            // Right
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

  private async handleCommand(cmd: ReturnType<typeof parseCommand>, input: string): Promise<void> {
    if (!cmd) return;

    // Clear the input area (top border, prompt+input line, bottom border)
    this.clearInputArea();

    const cols = process.stdout.columns || 80;
    const width = Math.max(40, Math.min(cols - 2, 100));
    const gray = '\x1b[90m';
    const reset = '\x1b[0m';

    // Show command in a system box
    const sysTop = '┌' + '─'.repeat(4) + ' Command ' + '─'.repeat(width - 13) + '┐';
    const sysBot = '└' + '─'.repeat(width - 2) + '┘';

    const lines: string[] = [];
    switch (cmd.type) {
      case 'help':
        lines.push('Available commands:');
        lines.push('  /exit                    Quit the session');
        lines.push('  /model                   Show current provider and model');
        lines.push('  /model <name>            Switch provider (anthropic, openai, siliconflow)');
        lines.push('  /cost                    Show session cost and token usage');
        lines.push('  /tools                   List available tools');
        lines.push('  /skills                  List loaded skills');
        lines.push('  /skill install <url>     Download and install a skill from URL');
        lines.push('  /skill remove <name>     Remove an installed skill');
        lines.push('  /tasks                   Show task graph status');
        lines.push('  /remember <text>         Save a note to user memory layer (permanent)');
        lines.push('  /forget <keyword>        Delete memories matching keyword');
        lines.push('  /memory                  Show memory stats and TTL rules');
        lines.push('  /plan                    Show current plan status or approve/discard');
        lines.push('  /help                    Show this help');
        lines.push('');
        lines.push('You can also ask the AI to use tools directly:');
        lines.push('  "Search the web for Node.js 22 features"');
        lines.push('  "Fetch https://example.com/docs"');
        lines.push('  "Install skill from https://..."');
        lines.push('  "Check git status" / "Show me recent commits"');
        lines.push('  "Undo the last edit"');
        lines.push('  "Show project structure" / "Find all test files"');
        lines.push('  "Start npm run dev in background"');
        break;
      case 'model': {
        if (cmd.args) {
          const name = cmd.args.toLowerCase().trim();
          if (this.onSwitchProvider) {
            const ok = await this.onSwitchProvider(name);
            if (ok) {
              const info = this.loop.getProviderInfo();
              lines.push(`Switched to ${info.name} (${info.model})`);
            } else {
              lines.push(`Failed to switch to "${cmd.args}". Check API key and provider name.`);
              lines.push('Supported: anthropic, openai, siliconflow');
            }
          } else {
            lines.push('Provider switching is not available.');
          }
        } else {
          const info = this.loop.getProviderInfo();
          lines.push(`Provider: ${info.name}`);
          lines.push(`Model:    ${info.model}`);
        }
        break;
      }
      case 'cost': {
        const ct = this.loop.getCostTracker();
        if (ct) {
          lines.push(ct.summary());
        } else {
          lines.push('Cost tracking is not enabled.');
        }
        break;
      }
      case 'tools': {
        const tools = this.loop.getTools();
        if (tools.length === 0) {
          lines.push('No tools registered.');
        } else {
          lines.push('Available tools:');
          for (const tool of tools) {
            lines.push(`  • ${tool.name}: ${tool.description}`);
          }
        }
        break;
      }
      case 'skills': {
        const skills = this.loop.getSkills();
        if (skills.length === 0) {
          lines.push('No skills loaded.');
          lines.push('Place .json or .md skill files in ~/.karen/skills/');
          lines.push('Or use /skill install <url> to download one.');
        } else {
          lines.push('Loaded skills:');
          for (const skill of skills) {
            const triggers = skill.trigger.join(', ');
            lines.push(`  • ${skill.name}: ${skill.description} [${triggers}]`);
          }
        }
        break;
      }
      case 'skill_install': {
        if (!cmd.args) {
          lines.push('Usage: /skill install <url>');
          lines.push('Example: /skill install https://example.com/debug.md');
          break;
        }
        if (!this.skillManager) {
          lines.push('Skill manager is not available.');
          break;
        }
        lines.push(`Downloading from ${cmd.args}...`);
        const skill = await this.skillManager.installFromUrl(cmd.args);
        if (skill) {
          lines.push(`Installed skill: ${skill.name}`);
          lines.push(`Description: ${skill.description}`);
          lines.push(`Triggers: ${skill.trigger.join(', ')}`);
          // Update loop's skills
          this.loop.setSkills(this.skillManager.getSkills());
        } else {
          lines.push('Failed to install skill.');
          lines.push('Check the URL and ensure it is a valid .md or .json skill file.');
        }
        break;
      }
      case 'skill_remove': {
        if (!cmd.args) {
          lines.push('Usage: /skill remove <name>');
          break;
        }
        if (!this.skillManager) {
          lines.push('Skill manager is not available.');
          break;
        }
        const ok = this.skillManager.remove(cmd.args);
        if (ok) {
          lines.push(`Removed skill: ${cmd.args}`);
          this.loop.setSkills(this.skillManager.getSkills());
        } else {
          lines.push(`Skill "${cmd.args}" not found.`);
        }
        break;
      }
      case 'tasks': {
        const tm = this.loop.getTaskManager();
        if (!tm) {
          lines.push('Task manager not available.');
          break;
        }
        const summary = tm.getSummary();
        if (summary.total === 0) {
          lines.push('No tasks yet.');
          lines.push('Tasks are created when you ask the AI to do multi-step work.');
        } else {
          lines.push(`Tasks: ${summary.total} total`);
          lines.push(`  Pending:   ${summary.pending}`);
          lines.push(`  Running:   ${summary.running}`);
          lines.push(`  Completed: ${summary.completed}`);
          lines.push(`  Failed:    ${summary.failed}`);
          const tasks = tm.list();
          for (const t of tasks) {
            const statusColor = t.status === 'completed' ? '\x1b[32m' : t.status === 'failed' ? '\x1b[31m' : '\x1b[33m';
            lines.push(`  ${statusColor}[${t.status}]\x1b[0m ${t.title}`);
          }
        }
        break;
      }
      case 'memory': {
        if (!this.memoryManager) {
          lines.push('Memory manager is not available.');
          break;
        }
        const all = await this.memoryManager.load({ includeExpired: true });
        const now = Date.now();

        // Count by type
        const counts: Record<string, number> = {};
        const expiredCounts: Record<string, number> = {};
        for (const m of all) {
          counts[m.type] = (counts[m.type] || 0) + 1;
          if (m.expiresAt && m.expiresAt < now) {
            expiredCounts[m.type] = (expiredCounts[m.type] || 0) + 1;
          }
        }

        lines.push('Memory Layer Statistics:');
        lines.push('');
        const types: MemoryType[] = ['project', 'global', 'user', 'skill', 'feedback', 'reference'];
        for (const t of types) {
          const total = counts[t] || 0;
          const expired = expiredCounts[t] || 0;
          const active = total - expired;
          const ttl = DEFAULT_TTL[t];
          const ttlStr = ttl > 0 ? `${ttl} days` : 'permanent (never)';
          lines.push(`  ${t.padEnd(10)}  active ${String(active).padStart(3)}  expired ${String(expired).padStart(3)}  TTL: ${ttlStr}`);
        }
        lines.push('');
        lines.push(`Total: ${all.length} memories`);

        // Show recent user memories
        const userMems = all.filter(m => m.type === 'user').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
        if (userMems.length > 0) {
          lines.push('');
          lines.push('Recent user memories (permanent):');
          for (const m of userMems) {
            const preview = m.content.slice(0, 50) + (m.content.length > 50 ? '...' : '');
            lines.push(`  • ${preview}`);
          }
        }
        break;
      }
      case 'remember': {
        if (!cmd.args) {
          lines.push('Usage: /remember <text>');
          lines.push('Example: /remember I always use TypeScript strict mode');
          break;
        }
        if (!this.memoryManager) {
          lines.push('Memory manager is not available.');
          break;
        }
        const memory = await this.memoryManager.save({
          type: 'user',
          content: cmd.args,
          tags: ['user-note'],
        });
        lines.push(`Saved to user memory: ${memory.id}`);
        lines.push(`Content: ${cmd.args.slice(0, 60)}${cmd.args.length > 60 ? '...' : ''}`);
        break;
      }
      case 'forget': {
        if (!cmd.args) {
          lines.push('Usage: /forget <keyword>');
          lines.push('Example: /forget TypeScript');
          break;
        }
        if (!this.memoryManager) {
          lines.push('Memory manager is not available.');
          break;
        }
        const all = await this.memoryManager.load({ keywords: [cmd.args] });
        const toDelete = all.filter(m => m.type === 'user');
        if (toDelete.length === 0) {
          lines.push(`No user memories found matching "${cmd.args}".`);
          break;
        }
        let deleted = 0;
        for (const m of toDelete) {
          const ok = await this.memoryManager.delete(m.id);
          if (ok) deleted++;
        }
        lines.push(`Deleted ${deleted} user memory(s) matching "${cmd.args}".`);
        break;
      }
      case 'plan': {
        if (!this.planManager) {
          lines.push('Plan manager is not available.');
          break;
        }
        const status = this.planManager.getStatus();
        if (!status.hasPlan) {
          lines.push('No active plan.');
          lines.push('The AI can submit a plan using the Plan tool for complex tasks.');
          break;
        }
        const subCmd = (cmd.args || '').toLowerCase().trim();
        if (subCmd === 'approve') {
          const ok = this.planManager.approve();
          lines.push(ok ? 'Plan approved. The AI may now execute the steps.' : 'No pending plan to approve.');
        } else if (subCmd === 'discard') {
          const ok = this.planManager.discard();
          lines.push(ok ? 'Active plan discarded.' : 'No active plan to discard.');
        } else {
          lines.push(...this.planManager.toMarkdown().split('\n'));
        }
        break;
      }
      default:
        lines.push('Unknown command.');
    }

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
