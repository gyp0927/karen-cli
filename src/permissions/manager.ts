import { SENSITIVE_TOOLS } from './policies.js';

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
    return this.confirm(toolName, args);
  }
}
