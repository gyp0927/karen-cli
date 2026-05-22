#!/usr/bin/env node
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import { AgentLoop } from '../src/core/loop.js';
import { Repl } from '../src/cli/repl.js';
import { Logger } from '../src/utils/logger.js';

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
  const preferred = process.env.KAREN_PROVIDER || 'anthropic';

  if (preferred === 'anthropic' && anthropicKey) {
    return new AnthropicProvider(anthropicKey);
  }
  if (preferred === 'openai' && openaiKey) {
    return new OpenAIProvider(openaiKey);
  }
  if (anthropicKey) {
    return new AnthropicProvider(anthropicKey);
  }
  if (openaiKey) {
    return new OpenAIProvider(openaiKey);
  }

  Logger.error('No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
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

async function main() {
  const provider = getProvider();
  Logger.info(`Using provider: ${provider.name}`);

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
