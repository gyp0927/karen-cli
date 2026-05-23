import { Logger } from '../utils/logger.js';

export interface StormBreakerOptions {
  /** Total request timeout in ms (default 120000). */
  requestTimeoutMs?: number;
  /** Max retries for transient failures (default 3). */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default 1000). */
  baseDelayMs?: number;
  /** Circuit breaker: consecutive failures before opening (default 5). */
  circuitThreshold?: number;
  /** Circuit breaker cooldown in ms (default 30000). */
  circuitCooldownMs?: number;
}

export class StormBreaker {
  private options: Required<StormBreakerOptions>;
  private failures = 0;
  private lastFailureTime = 0;
  private circuitOpen = false;

  constructor(options: StormBreakerOptions = {}) {
    this.options = {
      requestTimeoutMs: options.requestTimeoutMs ?? 120_000,
      maxRetries: options.maxRetries ?? 3,
      baseDelayMs: options.baseDelayMs ?? 1_000,
      circuitThreshold: options.circuitThreshold ?? 5,
      circuitCooldownMs: options.circuitCooldownMs ?? 30_000,
    };
  }

  /** Execute a promise with timeout, retries, and circuit breaker. */
  async execute<T>(
    label: string,
    operation: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> {
    this.checkCircuit();

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        const result = await this.withTimeout(label, operation());
        this.onSuccess();
        return result;
      } catch (err) {
        lastError = err as Error;
        const isTimeout = lastError.message.includes('timed out') || lastError.message.includes('abort');
        const isTransient = isTimeout || this.isTransientError(lastError);

        if (!isTransient || attempt === this.options.maxRetries) {
          this.onFailure();
          throw lastError;
        }

        const delay = this.options.baseDelayMs * Math.pow(2, attempt - 1);
        Logger.warn(`${label} attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        onRetry?.(attempt, lastError);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error(`${label} failed after ${this.options.maxRetries} retries`);
  }

  private async withTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${this.options.requestTimeoutMs}ms`));
      }, this.options.requestTimeoutMs);

      promise
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private isTransientError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return msg.includes('econnreset') ||
           msg.includes('etimedout') ||
           msg.includes('enotfound') ||
           msg.includes('rate limit') ||
           msg.includes('too many requests') ||
           msg.includes('internal server error') ||
           msg.includes('bad gateway') ||
           msg.includes('service unavailable');
  }

  private checkCircuit(): void {
    if (!this.circuitOpen) return;
    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed > this.options.circuitCooldownMs) {
      Logger.info('Circuit breaker: cooldown elapsed, half-open.');
      this.circuitOpen = false;
      this.failures = 0;
    } else {
      throw new Error(`Circuit breaker is OPEN. Too many consecutive failures. Try again in ${Math.ceil((this.options.circuitCooldownMs - elapsed) / 1000)}s.`);
    }
  }

  private onSuccess(): void {
    if (this.failures > 0) {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.options.circuitThreshold) {
      this.circuitOpen = true;
      Logger.error(`Circuit breaker OPENED after ${this.failures} consecutive failures.`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
