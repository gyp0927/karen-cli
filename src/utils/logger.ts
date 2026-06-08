import { appendFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from './paths.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Encapsulated logger state for test isolation. */
export class Logger {
  private static currentLevel: LogLevel = process.env.KAREN_LOG_LEVEL as LogLevel || 'info';
  private static logFile: string | null = null;

  static setLevel(level: LogLevel): void { Logger.currentLevel = level; }

  static enableFile(path?: string): void {
    const dir = getConfigDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    Logger.logFile = path || join(dir, 'karen.log');
  }

  static debug(msg: string, module?: string): void {
    if (LEVELS[Logger.currentLevel] > LEVELS.debug) return;
    const line = Logger.formatLine('DEBUG', msg, module);
    if (process.env.DEBUG) console.error(line);
    Logger.writeFile(line);
  }

  static info(msg: string, module?: string): void {
    if (LEVELS[Logger.currentLevel] > LEVELS.info) return;
    const line = Logger.formatLine('INFO', msg, module);
    console.error(line);
    Logger.writeFile(line);
  }

  static warn(msg: string, module?: string): void {
    if (LEVELS[Logger.currentLevel] > LEVELS.warn) return;
    const line = Logger.formatLine('WARN', msg, module);
    console.warn(line);
    Logger.writeFile(line);
  }

  static error(msg: string, module?: string): void {
    const line = Logger.formatLine('ERROR', msg, module);
    console.error(line);
    Logger.writeFile(line);
  }

  /** Measure execution time of an async operation. */
  static async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const ms = (performance.now() - start).toFixed(1);
      Logger.debug(`${label} took ${ms}ms`, 'perf');
    }
  }

  /** Reset logger state (useful for tests). */
  static reset(): void {
    Logger.currentLevel = process.env.KAREN_LOG_LEVEL as LogLevel || 'info';
    Logger.logFile = null;
  }

  private static formatLine(level: string, msg: string, module?: string): string {
    const ts = new Date().toISOString();
    const mod = module ? ` [${module}]` : '';
    return `${ts} ${level}${mod} ${msg}`;
  }

  private static writeFile(line: string): void {
    if (!Logger.logFile) return;
    appendFile(Logger.logFile, line + '\n', 'utf8').catch(() => { /* ignore */ });
  }
}
