import { SENSITIVE_TOOLS, isBashDangerous } from './policies.js';

export interface PermissionManagerOptions {
  confirm?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

export class PermissionManager {
  private confirm: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

  constructor(options: PermissionManagerOptions = {}) {
    this.confirm = options.confirm || (async () => {
      // Default: deny operations that reach this fallback.
      // Safe operations (non-sensitive Bash, Write, Edit) are already filtered by check().
      // Only dangerous operations reach here; deny them by default.
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

    // Write and Edit require explicit user confirmation (removed auto-approve).

    return this.confirm(toolName, args);
  }
}
