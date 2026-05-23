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
import { homedir } from 'os';
import { SkillLoader } from '../src/skills/loader.js';
import { SkillManager } from '../src/skills/manager.js';

import { createReadTool } from '../src/tools/read.js';
import { createWriteTool } from '../src/tools/write.js';
import { createEditTool } from '../src/tools/edit.js';
import { createBashTool } from '../src/tools/bash.js';
import { createGrepTool } from '../src/tools/grep.js';
import { createGlobTool } from '../src/tools/glob.js';
import { createSkillTool } from '../src/tools/skill.js';
import { createWebFetchTool } from '../src/tools/webfetch.js';
import { createWebSearchTool } from '../src/tools/websearch.js';
import { createWeatherTool } from '../src/tools/weather.js';
import { createGitTool } from '../src/tools/git.js';
import { createUndoTool } from '../src/tools/edit.js';
import { createIndexTool } from '../src/tools/index.js';
import { createMcpTool } from '../src/tools/mcp.js';
import { createPlanTool } from '../src/tools/plan.js';
import { createBackgroundJobTool } from '../src/tools/background-job.js';
import { promptTrust } from '../src/permissions/trust.js';
import { IProvider } from '../src/core/types.js';
import { MemoryManager } from '../src/memory/manager.js';
import { TaskManager } from '../src/tasks/manager.js';
import { HookManager } from '../src/hooks/manager.js';
import { ContextCompactor } from '../src/core/compaction.js';
import { createAgentTool } from '../src/tools/agent.js';
import { createTaskTool } from '../src/tools/task.js';
import { CostTracker } from '../src/core/cost.js';
import { StormBreaker } from '../src/core/storm.js';
import { PlanManager } from '../src/plan/manager.js';
import { JobManager } from '../src/jobs/manager.js';
import { RepeatGuard } from '../src/core/repeat-guard.js';
import { TranscriptLogger } from '../src/transcript/logger.js';

function createProvider(name: string): IProvider | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const siliconflowKey = process.env.SILICONFLOW_API_KEY;

  switch (name.toLowerCase()) {
    case 'anthropic':
      return anthropicKey ? new AnthropicProvider(anthropicKey) : null;
    case 'openai':
      return openaiKey ? new OpenAIProvider(openaiKey) : null;
    case 'siliconflow':
      return siliconflowKey ? new SiliconFlowProvider(siliconflowKey) : null;
    default:
      return null;
  }
}

function getProvider(): IProvider {
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
  const cwd = process.cwd();

  const provider = getProvider();
  const version = getVersion();

  const trusted = await promptTrust(cwd);
  if (!trusted) {
    process.exit(0);
  }

  console.clear();
  printBanner(provider, version);

  const skillManager = new SkillManager();
  const memoryManager = new MemoryManager(join(homedir(), '.karen', 'memory'));
  const taskManager = new TaskManager();
  const hookManager = new HookManager();
  const compactor = new ContextCompactor();
  const costTracker = new CostTracker(
    { dailyUsd: 10.0, sessionUsd: 5.0 },
    join(homedir(), '.karen', 'costs.json')
  );
  const stormBreaker = new StormBreaker({
    requestTimeoutMs: 120_000,
    maxRetries: 3,
    circuitThreshold: 5,
  });
  const planManager = new PlanManager();
  const jobManager = new JobManager();
  const repeatGuard = new RepeatGuard({ maxRepeats: 2, windowSize: 10 });
  const transcriptLogger = new TranscriptLogger(cwd);

  const tools = [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createUndoTool(),
    createBashTool(),
    createGrepTool(),
    createGlobTool(),
    createWebFetchTool(),
    createWebSearchTool(),
    createWeatherTool(),
    createGitTool(),
    createIndexTool(),
    createMcpTool(),
    createTaskTool(taskManager),
    createPlanTool(planManager),
    createBackgroundJobTool(jobManager),
  ];

  // Register a hook to log tool usage
  hookManager.register('post-loop', async (ctx) => {
    const { input, output } = ctx as Record<string, string>;
    if (input && output) {
      await memoryManager.save({
        type: 'feedback',
        content: `Task: ${input}\nResult: ${output.slice(0, 500)}`,
        tags: ['auto', 'hook'],
      });
    }
  });

  // Also load built-in skills
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const builtinDir = join(__dirname, '..', 'skills');
    const builtinLoader = new SkillLoader();
    builtinLoader.loadFromDirectory(builtinDir);
    for (const skill of builtinLoader.getAll()) {
      // Built-in skills are already loaded if they exist in the directory;
      // SkillManager loads from ~/.karen/skills by default.
      // We skip merging here to avoid duplicates; users can install overrides.
    }
  } catch { /* ignore */ }

  const skills = skillManager.getSkills();
  if (skills.length > 0) {
    console.log(`\x1b[90mLoaded ${skills.length} skill(s)\x1b[0m\n`);
  }

  const loop = new AgentLoop({
    provider,
    tools,
    skills,
    cwd: process.cwd(),
    memoryManager,
    taskManager,
    hookManager,
    compactor,
    costTracker,
    stormBreaker,
    planManager,
    repeatGuard,
    transcriptLogger,
    enableSchemaFlatten: true,
    onToolUse: (_toolName: string, _args: Record<string, unknown>) => {
      // Intentionally quiet: tool-use indicators written to stderr would
      // interleave with the Assistant box drawn on stdout and break the
      // layout. Progress is conveyed naturally by the model's own wording.
    },
  });

  // Register the Skill tool so AI can install/remove skills via natural language
  loop.addTool(createSkillTool(skillManager, () => {
    loop.setSkills(skillManager.getSkills());
  }));

  // Register the Agent tool for sub-agent delegation
  loop.addTool(createAgentTool(provider, loop.getTools()));

  const repl = new Repl({
    loop,
    skillManager,
    memoryManager,
    planManager,
    enablePermissionChecks: true,
    onSwitchProvider: (name: string) => {
      const provider = createProvider(name);
      if (!provider) return false;
      loop.setProvider(provider);
      return true;
    },
  });
  await repl.start();
}

main().catch((err) => {
  Logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
