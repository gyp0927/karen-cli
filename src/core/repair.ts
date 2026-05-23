import { ToolCall } from './types.js';
import { Logger } from '../utils/logger.js';

export interface RepairResult {
  repaired: ToolCall[];
  /** True if any repair was applied. */
  wasRepaired: boolean;
  /** Error message if repair failed completely. */
  error?: string;
}

/**
 * Fix malformed tool_calls from models (especially DeepSeek) that may output:
 * - Truncated JSON
 * - Missing closing braces/brackets
 * - Invalid escape sequences
 * - Extra markdown fences
 */
export class ToolCallRepair {
  /**
   * Attempt to repair a list of tool calls.
   * @param calls Raw tool calls that may be broken.
   */
  repair(calls: unknown[]): RepairResult {
    const repaired: ToolCall[] = [];
    let wasRepaired = false;

    for (const raw of calls) {
      try {
        const fixed = this.fixSingle(raw);
        if (fixed) {
          repaired.push(fixed);
          if (JSON.stringify(fixed) !== JSON.stringify(raw)) {
            wasRepaired = true;
          }
        }
      } catch (err) {
        Logger.warn(`ToolCallRepair: could not repair entry: ${(err as Error).message}`);
        wasRepaired = true;
      }
    }

    if (repaired.length === 0 && calls.length > 0) {
      return { repaired: [], wasRepaired: true, error: 'All tool calls were unrepairable' };
    }

    return { repaired, wasRepaired };
  }

  private fixSingle(raw: unknown): ToolCall | null {
    if (raw === null || raw === undefined) return null;

    // If it's already well-formed, return as-is
    if (this.isValidToolCall(raw)) {
      return raw as ToolCall;
    }

    // Try to coerce from partial object
    if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;

      const id = String(obj.id || obj.tool_call_id || this.generateId());
      const func = obj.function as Record<string, unknown> | undefined;
      const name = String(obj.name || func?.name || '');
      let args = obj.arguments || func?.arguments || obj.parameters || obj.input || obj.args;

      if (typeof args === 'string') {
        args = this.fixJsonString(args);
      }

      if (typeof args !== 'object' || args === null) {
        args = {};
      }

      if (!name) {
        return null; // Can't repair without a tool name
      }

      return { id, name, arguments: args as Record<string, unknown> };
    }

    // Try parsing as raw JSON string
    if (typeof raw === 'string') {
      const parsed = this.fixJsonString(raw);
      if (parsed && typeof parsed === 'object') {
        return this.fixSingle(parsed);
      }
    }

    return null;
  }

  private isValidToolCall(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const tc = obj as Record<string, unknown>;
    return typeof tc.id === 'string' &&
           typeof tc.name === 'string' &&
           tc.arguments !== undefined &&
           typeof tc.arguments === 'object';
  }

  /**
   * Fix a JSON string that may be truncated or malformed.
   * Returns the parsed object, or null if unrepairable.
   */
  private fixJsonString(str: string): unknown {
    const cleaned = str
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      // Try common truncation repairs
      const repairs = [
        cleaned,
        cleaned + '"}',
        cleaned + '}',
        cleaned + ']}',
        cleaned + ']}]}',
      ];

      for (const attempt of repairs) {
        try {
          return JSON.parse(attempt);
        } catch {
          // continue
        }
      }

      // Try stripping trailing commas and incomplete tokens
      const truncated = cleaned.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(truncated);
      } catch {
        // final fallback
        return null;
      }
    }
  }

  private generateId(): string {
    return 'call_repair_' + Math.random().toString(36).slice(2, 11);
  }
}
