/**
 * App factory — creates all managers, tools, and the agent loop.
 * Extracted from bin/karen.ts to keep the entry point lean.
 */
import { join } from 'path';
import { getConfigDir } from './utils/paths.js';
import { AgentLoop } from './core/loop.js';
import { MemoryManager } from './memory/manager.js';
import { TaskManager } from './tasks/manager.js';
import { HookManager } from './hooks/manager.js';
import { ContextCompactor } from './core/compaction.js';
import { CostTracker } from './core/cost.js';
import { StormBreaker } from './core/storm.js';
import { PlanManager } from './plan/manager.js';
import { JobManager } from './jobs/manager.js';
import { RepeatGuard } from './core/repeat-guard.js';
import { TranscriptLogger } from './transcript/logger.js';
import { SkillManager } from './skills/manager.js';
import { loadConfig } from './core/config.js';
import { IProvider, Tool } from './core/types.js';
import { DEFAULTS, TIMEOUTS } from './core/constants.js';
import { PermissionManager } from './permissions/manager.js';
import { isAutoApproveEnabled } from './permissions/policies.js';

import { createReadTool } from './tools/read.js';
import { createWriteTool } from './tools/write.js';
import { createEditTool, createUndoTool, EditHistoryStore } from './tools/edit.js';
import { createBashTool } from './tools/bash.js';
import { createGrepTool } from './tools/grep.js';
import { createGlobTool } from './tools/glob.js';
import { createWebFetchTool } from './tools/webfetch.js';
import { createWebSearchTool } from './tools/websearch.js';
import { createWeatherTool } from './tools/weather.js';
import { createGitTool } from './tools/git.js';
import { createIndexTool } from './tools/index.js';
import { createMcpTool } from './tools/mcp.js';
import { createTaskTool } from './tools/task.js';
import { createPlanTool } from './tools/plan.js';
import { createBackgroundJobTool } from './tools/background-job.js';
import { createVerifyTool } from './tools/verify.js';
import { createAskChoiceTool } from './tools/ask_choice.js';
import { createTodoWriteTool } from './tools/todo_write.js';
import { createGetSymbolsTool } from './tools/get_symbols.js';
import { createFileOpsTool } from './tools/fileops.js';
import { createSearchFilesTool } from './tools/search_files.js';
import { createSubAgentTool } from './tools/sub_agent.js';
import { createSkillTool } from './tools/skill.js';
import { createCreateSkillTool } from './tools/create_skill.js';
import { createAgentTool } from './tools/agent.js';

export interface AppContext {
  loop: AgentLoop;
  skillManager: SkillManager;
  memoryManager: MemoryManager;
  taskManager: TaskManager;
  hookManager: HookManager;
  planManager: PlanManager;
  jobManager: JobManager;
  transcriptLogger: TranscriptLogger;
}

function createAllTools(taskManager: TaskManager, planManager: PlanManager, jobManager: JobManager): Tool[] {
  const editStore = new EditHistoryStore();
  return [
    createReadTool(), createWriteTool(), createEditTool(editStore), createUndoTool(editStore),
    createBashTool(), createGrepTool(), createGlobTool(),
    createWebFetchTool(), createWebSearchTool(), createWeatherTool(),
    createGitTool(), createIndexTool(), createMcpTool(),
    createTaskTool(taskManager), createPlanTool(planManager),
    createBackgroundJobTool(jobManager), createVerifyTool(),
    createAskChoiceTool(), createTodoWriteTool(), createGetSymbolsTool(),
    createFileOpsTool(), createSearchFilesTool(),
  ];
}

export async function createApp(provider: IProvider, cwd: string, options?: { autoApprove?: boolean }): Promise<AppContext> {
  const config = loadConfig();

  const skillManager = new SkillManager();
  const memoryManager = new MemoryManager(join(getConfigDir(), 'memory'));
  const taskManager = new TaskManager();
  const hookManager = new HookManager();
  const compactor = new ContextCompactor(DEFAULTS.COMPACTOR_MAX_TOKENS, DEFAULTS.COMPACTOR_KEEP_RECENT);
  const costTracker = new CostTracker(
    config.budget || { dailyUsd: 10.0, sessionUsd: 5.0 },
    join(getConfigDir(), 'costs.json')
  );
  const stormBreaker = new StormBreaker({ requestTimeoutMs: TIMEOUTS.LLM_REQUEST, maxRetries: 3, circuitThreshold: DEFAULTS.CIRCUIT_THRESHOLD });
  const planManager = new PlanManager();
  const jobManager = new JobManager();
  const repeatGuard = new RepeatGuard({ maxRepeats: DEFAULTS.REPEAT_GUARD_MAX, forceExitThreshold: 4, windowSize: DEFAULTS.REPEAT_GUARD_WINDOW });
  const transcriptLogger = new TranscriptLogger(cwd);

  const tools = createAllTools(taskManager, planManager, jobManager);

  // Hook: auto-save feedback
  hookManager.register('post-loop', async (ctx) => {
    const { input, output } = ctx as Record<string, string>;
    if (input && output) {
      await memoryManager.save({ type: 'feedback', content: `Task: ${input}\nResult: ${output.slice(0, 500)}`, tags: ['auto', 'hook'] });
    }
  });

  const skills = skillManager.getSkills();
  if (skills.length > 0) console.log(`\x1b[90mLoaded ${skills.length} skill(s)\x1b[0m\n`);

  // Determine auto-approve: CLI flag > env var > config file
  const autoApprove = options?.autoApprove ?? isAutoApproveEnabled() ?? config.autoApprove ?? false;
  const permissionManager = new PermissionManager({ autoApprove });

  const loop = new AgentLoop({
    provider, tools, skills, cwd,
    memoryManager, taskManager, hookManager, compactor,
    costTracker, stormBreaker, planManager, repeatGuard, transcriptLogger,
    enableSchemaFlatten: true,
    permissionManager,
  });

  // Auto-checkpoint
  if (config.autoCheckpoint !== false) {
    const { autoCheckpoint } = await import('./core/checkpoint.js');
    const orig = loop.onToolUse;
    loop.onToolUse = (name, args) => { orig?.(name, args); if (name === 'Write' || name === 'Edit') autoCheckpoint(cwd); };
  }

  // Runtime tools
  loop.addTool(createSkillTool(skillManager, () => { loop.setSkills(skillManager.getSkills()); }));
  loop.addTool(createCreateSkillTool(skillManager, () => { loop.setSkills(skillManager.getSkills()); }));
  loop.addTool(createAgentTool(provider, loop.getTools().filter(t => t.name !== 'Agent'), {
    memoryManager,
    taskManager,
    transcriptLogger,
  }));
  loop.addTool(createSubAgentTool(provider, loop.getTools().filter(t => t.name !== 'sub_agent'), {
    memoryManager,
    taskManager,
    transcriptLogger,
  }));

  return { loop, skillManager, memoryManager, taskManager, hookManager, planManager, jobManager, transcriptLogger };
}
