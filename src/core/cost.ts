import { TokenUsage } from './types.js';
import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

// Pricing per 1M tokens (USD). Update as providers change prices.
const PRICING: Record<string, { prompt: number; completion: number }> = {
  'deepseek-ai/DeepSeek-V4-Flash': { prompt: 0.10, completion: 0.30 },
  'deepseek-ai/DeepSeek-V3': { prompt: 0.14, completion: 0.28 },
  'deepseek-ai/DeepSeek-V3.2': { prompt: 0.27, completion: 0.42 },
  'claude-sonnet-4-6': { prompt: 3.00, completion: 15.00 },
  'gpt-4o': { prompt: 2.50, completion: 10.00 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.60 },
};

export function getPricePer1M(model: string): { prompt: number; completion: number } {
  return PRICING[model] || { prompt: 0.50, completion: 1.50 };
}

export interface CostRecord {
  timestamp: number;
  provider: string;
  model: string;
  usage: TokenUsage;
  costUsd: number;
}

export interface BudgetConfig {
  dailyUsd?: number;
  monthlyUsd?: number;
  sessionUsd?: number;
}

export class CostTracker {
  private records: CostRecord[] = [];
  private budget: BudgetConfig;
  private startTime: number;
  private statePath?: string;
  private stateLoaded = false;

  constructor(budget: BudgetConfig = {}, statePath?: string) {
    this.budget = budget;
    this.startTime = Date.now();
    this.statePath = statePath;
  }

  /** Lazy-load persisted state to avoid sync I/O in constructor. */
  private loadState(): void {
    if (this.stateLoaded || !this.statePath) return;
    this.stateLoaded = true;
    if (existsSync(this.statePath)) {
      try {
        const data = JSON.parse(readFileSync(this.statePath, 'utf8'));
        this.records = data.records || [];
      } catch { /* ignore */ }
    }
  }

  /** Record a request's token usage and cost. */
  record(provider: string, model: string, usage: TokenUsage): void {
    this.loadState();
    const price = getPricePer1M(model);
    const costUsd = (usage.prompt * price.prompt + usage.completion * price.completion) / 1_000_000;
    this.records.push({ timestamp: Date.now(), provider, model, usage, costUsd });
    this.persistAsync();
  }

  /** Check if adding this request would exceed budget. Returns true if allowed. */
  checkBudget(provider: string, model: string, estimatedUsage: TokenUsage): { allowed: boolean; reason?: string } {
    this.loadState();
    const price = getPricePer1M(model);
    const estimatedCost = (estimatedUsage.prompt * price.prompt + estimatedUsage.completion * price.completion) / 1_000_000;

    if (this.budget.sessionUsd) {
      const sessionCost = this.sessionCost();
      if (sessionCost + estimatedCost > this.budget.sessionUsd) {
        return { allowed: false, reason: `Session budget $${this.budget.sessionUsd.toFixed(2)} exceeded (current $${sessionCost.toFixed(4)})` };
      }
    }

    if (this.budget.dailyUsd) {
      const todayCost = this.dailyCost();
      if (todayCost + estimatedCost > this.budget.dailyUsd) {
        return { allowed: false, reason: `Daily budget $${this.budget.dailyUsd.toFixed(2)} exceeded (current $${todayCost.toFixed(4)})` };
      }
    }

    if (this.budget.monthlyUsd) {
      const monthCost = this.monthlyCost();
      if (monthCost + estimatedCost > this.budget.monthlyUsd) {
        return { allowed: false, reason: `Monthly budget $${this.budget.monthlyUsd.toFixed(2)} exceeded (current $${monthCost.toFixed(4)})` };
      }
    }

    return { allowed: true };
  }

  sessionCost(): number {
    return this.records
      .filter(r => r.timestamp >= this.startTime)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  dailyCost(): number {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.records
      .filter(r => r.timestamp >= startOfDay.getTime())
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  monthlyCost(): number {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return this.records
      .filter(r => r.timestamp >= startOfMonth.getTime())
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  totalTokens(): { prompt: number; completion: number; total: number } {
    return this.records.reduce(
      (acc, r) => ({
        prompt: acc.prompt + r.usage.prompt,
        completion: acc.completion + r.usage.completion,
        total: acc.total + r.usage.total,
      }),
      { prompt: 0, completion: 0, total: 0 }
    );
  }

  summary(): string {
    const today = this.dailyCost();
    const month = this.monthlyCost();
    const session = this.sessionCost();
    const tokens = this.totalTokens();
    const lines: string[] = [];
    lines.push(`Session: $${session.toFixed(4)} | Today: $${today.toFixed(4)} | Month: $${month.toFixed(4)}`);
    lines.push(`Tokens: ${tokens.total.toLocaleString()} (prompt ${tokens.prompt.toLocaleString()}, completion ${tokens.completion.toLocaleString()})`);
    if (this.budget.dailyUsd) {
      const pct = Math.min(100, (today / this.budget.dailyUsd) * 100);
      lines.push(`Daily budget: ${pct.toFixed(1)}% of $${this.budget.dailyUsd}`);
    }
    return lines.join('\n');
  }

  private writePromise: Promise<void> = Promise.resolve();

  private persistAsync(): void {
    if (!this.statePath) return;
    const path = this.statePath;
    const data = JSON.stringify({ records: this.records.slice(-500) }, null, 2);
    // Chain writes to prevent race conditions on rapid calls
    this.writePromise = this.writePromise.then(async () => {
      try {
        const dir = dirname(path);
        await mkdir(dir, { recursive: true });
        await writeFile(path, data, 'utf8');
      } catch { /* ignore */ }
    }).catch(() => { /* ignore */ });
  }
}
