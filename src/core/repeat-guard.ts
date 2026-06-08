import { ToolCall } from './types.js';

export interface RepeatGuardConfig {
  /** Max identical calls before warning. */
  maxRepeats: number;
  /** Max identical calls before forcing exit (should be > maxRepeats). */
  forceExitThreshold: number;
  /** Window size for looking back. */
  windowSize: number;
}

export interface RepeatGuardResult {
  isRepeat: boolean;
  repeatCount: number;
  warning?: string;
  forceExit: boolean;
}

/**
 * Detect repeated identical tool calls within a sliding window.
 * Helps prevent the model from looping on the same call.
 */
export class RepeatGuard {
  private config: RepeatGuardConfig;
  private history: { fingerprint: string; timestamp: number }[] = [];

  constructor(config: RepeatGuardConfig = { maxRepeats: 2, forceExitThreshold: 4, windowSize: 10 }) {
    this.config = config;
  }

  check(calls: ToolCall[] | undefined): RepeatGuardResult {
    const safeCalls = calls || [];
    const now = Date.now();
    const fingerprints = safeCalls.map((c) => this.fingerprint(c));

    // Remove entries outside the window (by count, not time)
    if (this.history.length > this.config.windowSize) {
      this.history = this.history.slice(-this.config.windowSize);
    }

    // Check each call against history
    let maxRepeat = 0;
    for (const fp of fingerprints) {
      const repeats = this.history.filter((h) => h.fingerprint === fp).length;
      if (repeats > maxRepeat) maxRepeat = repeats;
    }

    // Record current calls
    for (const fp of fingerprints) {
      this.history.push({ fingerprint: fp, timestamp: now });
    }

    if (maxRepeat >= this.config.forceExitThreshold) {
      return {
        isRepeat: true,
        repeatCount: maxRepeat,
        warning: `[repeat-loop guard] You have already called this tool ${maxRepeat} time(s). Continuing to repeat the same call will not help. Synthesize what you know and give the user a final answer, or ask for clarification.`,
        forceExit: true,
      };
    }

    if (maxRepeat >= this.config.maxRepeats) {
      return {
        isRepeat: true,
        repeatCount: maxRepeat,
        warning: `[repeat-loop guard] You have already called this tool ${maxRepeat} time(s). Continuing to repeat the same call will not help. Synthesize what you know and give the user a final answer, or ask for clarification.`,
        forceExit: false,
      };
    }

    // Only warn when approaching the limit, not on first repeat
    // maxRepeat=1 is normal (called once before), allow up to maxRepeats-1
    if (maxRepeat >= Math.max(1, this.config.maxRepeats - 1)) {
      return {
        isRepeat: true,
        repeatCount: maxRepeat,
        warning: `[repeat-loop guard] You already called this tool recently (${maxRepeat}x). Avoid repeating unless the arguments genuinely changed.`,
        forceExit: false,
      };
    }

    return { isRepeat: false, repeatCount: 0, forceExit: false };
  }

  reset(): void {
    this.history = [];
  }

  private fingerprint(call: ToolCall): string {
    const argsKey = Object.keys(call.arguments)
      .sort()
      .map((k) => `${k}=${JSON.stringify(call.arguments[k])}`)
      .join('&');
    return `${call.name}(${argsKey})`;
  }
}
