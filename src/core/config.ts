import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';

export interface KarenConfig {
  provider?: 'anthropic' | 'openai' | 'deepseek' | 'siliconflow';
  model?: string;
  apiKeys?: {
    anthropic?: string;
    openai?: string;
    deepseek?: string;
    siliconflow?: string;
  };
  budget?: {
    dailyUsd?: number;
    sessionUsd?: number;
  };
  autoCheckpoint?: boolean;
  trustedPaths?: string[];
  skillsDir?: string;
  /** Max iterations per agent loop (default: 25) */
  maxIterations?: number;
  /** Default timeout for Bash tool in ms (default: 120000) */
  bashTimeout?: number;
  /** Enable streaming output (default: true) */
  streaming?: boolean;
  /** Enable auto-compact of context when token budget exceeded (default: true) */
  autoCompact?: boolean;
  /** Enable transcript logging (default: true) */
  transcriptLogging?: boolean;
  /** Max number of background processes (default: 50) */
  maxBackgroundProcesses?: number;
  /** Enable file backups on write (default: true) */
  backupOnWrite?: boolean;
  /** Custom system prompt additions */
  customSystemPrompt?: string;
  /** Auto-approve safe operations in non-interactive mode (default: false) */
  autoApprove?: boolean;
}

const CONFIG_DIR = getConfigDir();
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULTS: Required<KarenConfig> = {
  provider: 'anthropic',
  model: '',
  apiKeys: {},
  budget: {},
  autoCheckpoint: true,
  trustedPaths: [],
  skillsDir: '',
  maxIterations: 25,
  bashTimeout: 120000,
  streaming: true,
  autoCompact: true,
  transcriptLogging: true,
  maxBackgroundProcesses: 50,
  backupOnWrite: true,
  customSystemPrompt: '',
  autoApprove: false,
};

/** Encapsulated config storage for test isolation and single-responsibility. */
export class ConfigStore {
  private cached: KarenConfig | null = null;

  load(): KarenConfig {
    if (this.cached) return this.cached;

    if (!existsSync(CONFIG_PATH)) {
      return (this.cached = { ...DEFAULTS });
    }

    try {
      const raw = readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return (this.cached = { ...DEFAULTS });
      }
      return (this.cached = { ...DEFAULTS, ...parsed });
    } catch {
      return (this.cached = { ...DEFAULTS });
    }
  }

  save(config: KarenConfig): void {
    const validated = validateConfig(config);
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(validated, null, 2), 'utf8');
    this.cached = validated;
  }

  getValue<K extends keyof KarenConfig>(key: K): Required<KarenConfig>[K] {
    const config = this.load();
    return (config[key] ?? DEFAULTS[key]) as Required<KarenConfig>[K];
  }

  setValue<K extends keyof KarenConfig>(key: K, value: KarenConfig[K]): void {
    const config = this.load();
    config[key] = value;
    this.save(config);
  }

  reset(): void {
    this.save({ ...DEFAULTS });
    this.cached = null;
  }

  getPath(): string {
    return CONFIG_PATH;
  }
}

/** Default singleton instance for backward compatibility. */
const defaultStore = new ConfigStore();

export function loadConfig(): KarenConfig {
  return defaultStore.load();
}

export function saveConfig(config: KarenConfig): void {
  return defaultStore.save(config);
}

export function getConfigPath(): string {
  return defaultStore.getPath();
}

/** Get a specific config value with fallback to default */
export function getConfigValue<K extends keyof KarenConfig>(key: K): Required<KarenConfig>[K] {
  return defaultStore.getValue(key);
}

/** Update a single config value */
export function setConfigValue<K extends keyof KarenConfig>(key: K, value: KarenConfig[K]): void {
  defaultStore.setValue(key, value);
}

/** Reset config to defaults */
export function resetConfig(): void {
  defaultStore.reset();
}

function validateConfig(config: KarenConfig): KarenConfig {
  const validated: KarenConfig = { ...config };

  // Validate API keys format
  if (validated.apiKeys) {
    for (const [provider, key] of Object.entries(validated.apiKeys)) {
      if (key && typeof key === 'string' && !key.startsWith('sk-') && !key.startsWith('sk-ant-')) {
        Logger.warn(`API key for ${provider} doesn't start with expected prefix`);
      }
    }
  }

  // Validate budget values
  if (validated.budget) {
    if (validated.budget.dailyUsd !== undefined && validated.budget.dailyUsd < 0) {
      throw new Error('dailyUsd budget cannot be negative');
    }
    if (validated.budget.sessionUsd !== undefined && validated.budget.sessionUsd < 0) {
      throw new Error('sessionUsd budget cannot be negative');
    }
  }

  // Validate maxIterations
  if (validated.maxIterations !== undefined) {
    if (validated.maxIterations < 1 || validated.maxIterations > 1000) {
      throw new Error('maxIterations must be between 1 and 1000');
    }
  }

  return validated;
}
