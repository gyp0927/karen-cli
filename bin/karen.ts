#!/usr/bin/env node
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import { SiliconFlowProvider } from '../src/providers/siliconflow.js';
import { AgentLoop } from '../src/core/loop.js';
import { Repl } from '../src/cli/repl.js';
import { Logger } from '../src/utils/logger.js';
import { printBanner } from '../src/cli/banner.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { createReadTool } from '../src/tools/read.js';
import { createWriteTool } from '../src/tools/write.js';
import { createEditTool } from '../src/tools/edit.js';
import { createBashTool } from '../src/tools/bash.js';
import { createGrepTool } from '../src/tools/grep.js';
import { createGlobTool } from '../src/tools/glob.js';
import { PermissionManager } from '../src/permissions/manager.js';

function getProvider() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const siliconflowKey = process.env.SILICONFLOW_API_KEY;
  const preferred = process.env.KAREN_PROVIDER || 'anthropic';

  if (preferred === 'anthropic' && anthropicKey) {
    return new AnthropicProvider(anthropicKey);
  }
  if (preferred === 'openai' && openaiKey) {
    return new OpenAIProvider(openaiKey);
  }
  if (preferred === 'siliconflow' && siliconflowKey) {
    return new SiliconFlowProvider(siliconflowKey);
  }
  if (anthropicKey) {
    return new AnthropicProvider(anthropicKey);
  }
  if (openaiKey) {
    return new OpenAIProvider(openaiKey);
  }
  if (siliconflowKey) {
    return new SiliconFlowProvider(siliconflowKey);
  }

  Logger.error('No API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or SILICONFLOW_API_KEY.');
  process.exit(1);
}

function getPermissionManager(): PermissionManager {
  return new PermissionManager({
    confirm: async (toolName: string, args: Record<string, unknown>) => {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise<boolean>((resolve) => {
        const command = toolName === 'Bash'
          ? String(args.command)
          : String(args.file_path);
        rl.question(`Allow ${toolName} on "${command}"? (y/n): `, (answer) => {
          rl.close();
          resolve(answer.toLowerCase().startsWith('y'));
        });
      });
    },
  });
}

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main() {
  const provider = getProvider();
  const version = getVersion();

  printBanner(provider, version);

  const tools = [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createBashTool(),
    createGrepTool(),
    createGlobTool(),
  ];

  const loop = new AgentLoop({
    provider,
    tools,
    permissionManager: getPermissionManager(),
  });

  const repl = new Repl({ loop });
  await repl.start();
}

main().catch((err) => {
  Logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
