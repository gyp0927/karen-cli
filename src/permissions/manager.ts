import { Logger } from '../utils/logger.js';
import { SENSITIVE_TOOLS, isBashDangerous } from './policies.js';

export interface PermissionManagerOptions {
  confirm?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  autoApprove?: boolean;
}

export class PermissionManager {
  private confirm: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  private autoApprove: boolean;

  constructor(options: PermissionManagerOptions = {}) {
    this.autoApprove = options.autoApprove ?? false;
    this.confirm = options.confirm || (async (toolName: string, args: Record<string, unknown>) => {
      // No confirm callback provided (non-interactive mode)
      if (this.autoApprove) {
        // Auto-approve is enabled, but still deny dangerous operations
        Logger.warn(`Permission denied for ${toolName}: dangerous operation requires explicit confirmation even with auto-approve enabled`, 'permissions');
        return false;
      }
      Logger.warn(`Permission denied for ${toolName}: no confirm callback provided in non-interactive mode`, 'permissions');
      return false;
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

    // Write and Edit require explicit user confirmation.
    // In non-interactive mode with autoApprove, safe non-Bash operations are still blocked
    // because they are considered sensitive (Write/Edit).

    return this.confirm(toolName, args);
  }
}
