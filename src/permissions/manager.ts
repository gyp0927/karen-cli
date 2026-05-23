import { SENSITIVE_TOOLS, isBashDangerous } from './policies.js';

export interface PermissionManagerOptions {
  confirm?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

export class PermissionManager {
  private confirm: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

  constructor(options: PermissionManagerOptions = {}) {
    this.confirm = options.confirm || (async () => {
      // Default: ask via stdin in real CLI
      return true;
    });
  }

  async check(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    if (!SENSITIVE_TOOLS.includes(toolName)) {
      return true;
    }

    // Smart Bash permission: auto-allow safe read-only commands,
    // only confirm dangerous ones (rm, sudo, redirects, piped shells, etc.).
    if (toolName === 'Bash') {
      const command = String(args.command || '');
      if (!isBashDangerous(command)) {
        return true;
      }
    }

    // Write and Edit are core coding operations — auto-approve like Claude Code.
    if (toolName === 'Write' || toolName === 'Edit') {
      return true;
    }

    return this.confirm(toolName, args);
  }
}
