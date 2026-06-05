#!/usr/bin/env node
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import { SiliconFlowProvider } from '../src/providers/siliconflow.js';
import { DeepSeekProvider } from '../src/providers/deepseek.js';
import { Repl } from '../src/cli/repl.js';
import { Logger } from '../src/utils/logger.js';
import { printBanner } from '../src/cli/banner.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { SkillLoader } from '../src/skills/loader.js';
import { promptTrust } from '../src/permissions/trust.js';
import type { IProvider } from '../src/core/types.js';
import { createApp } from '../src/app.js';
import { healthCheck } from '../src/core/health.js';
import { loadConfig } from '../src/core/config.js';

function createProvider(name: string): IProvider | null {
  const config = loadConfig();
  const apiKeys = config.apiKeys || {};
  const key = process.env[`${name.toUpperCase()}_API_KEY`]
    || (apiKeys as Record<string, string | undefined>)[name]
    || process.env.ANTHROPIC_API_KEY; // fallback for legacy
  const model = process.env.KAREN_MODEL || process.env[`${name.toUpperCase()}_MODEL`];
  if (!key) return null;
  switch (name) {
    case 'anthropic': return new AnthropicProvider(key, model || undefined);
    case 'openai': return new OpenAIProvider(key, model || undefined);
    case 'siliconflow': return new SiliconFlowProvider(key, model || undefined);
    case 'deepseek': return new DeepSeekProvider(key, model || undefined);
    default: return null;
  }
}

function getProvider(): IProvider {
  const config = loadConfig();
  // Config takes priority, env var is fallback
  const preferred = config.provider || process.env.KAREN_PROVIDER || 'anthropic';
  for (const name of [preferred, 'anthropic', 'openai', 'deepseek', 'siliconflow']) {
    const p = createProvider(name);
    if (p) return p;
  }
  Logger.error('No API key. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or SILICONFLOW_API_KEY.');
  process.exit(1);
}

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const pkgPath = join(dirname(__filename), '..', '..', 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf-8')).version || '0.0.0';
  } catch { return '0.0.0'; }
}

async function main() {
  const args = process.argv.slice(2);

  // CLI flags
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`karen-cli v${getVersion()}`);
    process.exit(0);
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`karen-cli v${getVersion()} — AI coding assistant\n`);
    console.log('Usage: karen [flags]\n');
    console.log('Flags:');
    console.log('  --version, -v    Show version');
    console.log('  --help, -h       Show this help');
    console.log('  --model <name>          Start with specific model');
    console.log('  --print <message>        Non-interactive: run one prompt and exit');
    console.log('  --output-format json     JSON output (with --print)');
    console.log('  --resume <id>            Resume from session');
    console.log('\nEnvironment:');
    console.log('  KAREN_PROVIDER        Default provider (anthropic/openai/deepseek/siliconflow)');
    console.log('  ANTHROPIC_API_KEY     Claude API key');
    console.log('  OPENAI_API_KEY        GPT-4o API key');
    console.log('  SILICONFLOW_API_KEY   DeepSeek API key');
    console.log('  KAREN_LOG_LEVEL       Log level (debug/info/warn/error)');
    process.exit(0);
  }

  const modelArg = args.indexOf('--model');
  if (modelArg !== -1 && args[modelArg + 1]) {
    process.env.KAREN_MODEL = args[modelArg + 1];
  }

  // --print: non-interactive mode, returns result and exits
  const printArg = args.indexOf('--print');
  const printMessage = printArg !== -1 ? args[printArg + 1] || args.slice(printArg + 1).join(' ') : '';
  const outputJson = args.includes('--output-format') && args[args.indexOf('--output-format') + 1] === 'json';
  const resumeSession = args.indexOf('--resume');
  const resumeId = resumeSession !== -1 ? args[resumeSession + 1] : undefined;

  const cwd = process.cwd();
  const provider = getProvider();
  const version = getVersion();

  if (!(await promptTrust(cwd))) process.exit(0);

  healthCheck();

  const { loop, skillManager, memoryManager, planManager, transcriptLogger, jobManager } = await createApp(provider, cwd);

  // --print mode: run one turn and exit
  if (printMessage) {
    const history = resumeId ? await loop.loadSession() : [];
    const { content } = await loop.run(printMessage, undefined, history);
    if (outputJson) {
      console.log(JSON.stringify({ result: content }));
    } else {
      console.log(content);
    }
    await transcriptLogger.flush();
    process.exit(0);
  }

  console.clear();
  printBanner(provider, version);

  // Load built-in skills
  try {
    const __filename = fileURLToPath(import.meta.url);
    const builtinDir = join(dirname(__filename), '..', 'skills');
    const loader = new SkillLoader();
    const builtins = loader.loadFromDirectory(builtinDir);
    for (const s of builtins) {
      const dest = join(homedir(), '.karen', 'skills', `${s.name}.json`);
      if (!existsSync(dest)) writeFileSync(dest, JSON.stringify(s, null, 2), 'utf8');
    }
  } catch { /* ignore */ }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n\x1b[90mShutting down...\x1b[0m');
    loop.cancelPendingSaves();
    try { transcriptLogger.flush(); } catch {}
    try { jobManager.cleanup(); } catch {}
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const repl = new Repl({
    loop,
    skillManager,
    memoryManager,
    planManager,
    enablePermissionChecks: true,
    onSwitchProvider: (name: string, model?: string) => {
      if (model) process.env[`${name.toUpperCase()}_MODEL`] = model;
      const p = createProvider(name);
      if (!p) return false;
      loop.setProvider(p);
      return true;
    },
  });
  await repl.start();
}

main().catch((err) => {
  Logger.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
