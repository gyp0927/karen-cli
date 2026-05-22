import { HookName, HookCallback } from './types.js';

export class HookManager {
  private hooks: Map<HookName, HookCallback[]> = new Map();

  register(name: HookName, callback: HookCallback): void {
    const existing = this.hooks.get(name) || [];
    existing.push(callback);
    this.hooks.set(name, existing);
  }

  unregister(name: HookName, callback: HookCallback): void {
    const existing = this.hooks.get(name);
    if (!existing) return;
    const index = existing.indexOf(callback);
    if (index !== -1) {
      existing.splice(index, 1);
    }
  }

  async trigger(name: HookName, context: Record<string, unknown> = {}): Promise<Error[]> {
    const callbacks = this.hooks.get(name) || [];
    const errors: Error[] = [];

    for (const callback of callbacks) {
      try {
        await callback(context);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    return errors;
  }

  hasHooks(name: HookName): boolean {
    const callbacks = this.hooks.get(name);
    return !!callbacks && callbacks.length > 0;
  }

  clear(name?: HookName): void {
    if (name) {
      this.hooks.delete(name);
    } else {
      this.hooks.clear();
    }
  }
}
