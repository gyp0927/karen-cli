import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { Logger } from '../utils/logger.js';

interface HealthStatus {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

export function healthCheck(): HealthStatus {
  const checks: HealthStatus['checks'] = [];

  // API keys
  const providers = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'SILICONFLOW_API_KEY'];
  const hasKey = providers.some(k => process.env[k]);
  checks.push({
    name: 'API keys',
    ok: hasKey,
    detail: hasKey ? 'At least one provider key found' : `No API key set. Set one of: ${providers.join(', ')}`,
  });

  // Disk space (basic check — .karen directory writable)
  try {
    const dir = join(homedir(), '.karen');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    checks.push({ name: 'Storage', ok: true, detail: `${dir} is writable` });
  } catch {
    checks.push({ name: 'Storage', ok: false, detail: 'Cannot write to ~/.karen directory' });
  }

  // Git available
  try {
    execSync('git --version', { stdio: 'ignore' });
    checks.push({ name: 'Git', ok: true, detail: 'Git is available' });
  } catch {
    checks.push({ name: 'Git', ok: false, detail: 'Git not found. Checkpoint/rollback disabled.' });
  }

  // Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  checks.push({
    name: 'Node.js',
    ok: major >= 20,
    detail: `Running ${nodeVersion} (requires >= 20)`,
  });

  // MCP SDK
  try {
    require.resolve('@modelcontextprotocol/sdk');
    checks.push({ name: 'MCP SDK', ok: true, detail: 'MCP SDK loaded' });
  } catch {
    checks.push({ name: 'MCP SDK', ok: false, detail: 'MCP SDK not installed' });
  }

  const allOk = checks.every(c => c.ok);

  if (!allOk) {
    Logger.warn('Health check: some issues found', 'health');
    for (const c of checks) {
      if (!c.ok) Logger.warn(`  ✗ ${c.name}: ${c.detail}`, 'health');
    }
  }

  return { ok: allOk, checks };
}
