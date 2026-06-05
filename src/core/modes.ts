export type KarenMode = 'chat' | 'code' | 'agent' | 'plan';

export interface ModeConfig {
  name: string;
  emoji: string;
  description: string;
  /** Injected into system prompt to shape behavior for this mode. */
  behaviorPrompt: string;
}

export const MODES: Record<KarenMode, ModeConfig> = {
  chat: {
    name: 'Chat',
    emoji: '💬',
    description: 'Q&A — answers questions, no file changes',
    behaviorPrompt: 'You are in CHAT mode. Answer questions, explain concepts, and provide information. Do NOT modify files, run commands, or use Write/Edit/Bash tools unless the user explicitly asks you to. Prefer reading and searching over changing.',
  },
  code: {
    name: 'Code',
    emoji: '🔧',
    description: 'Coding — reads, writes, edits freely',
    behaviorPrompt: 'You are in CODE mode. You have full access to the file system. Read, write, edit, search, and execute as needed. Be proactive — if the user asks for a change, make it. Always verify your changes with the Verify tool.',
  },
  agent: {
    name: 'Agent',
    emoji: '🤖',
    description: 'Autonomous — plan → execute → verify loop',
    behaviorPrompt: 'You are in AGENT mode. Work autonomously: break complex tasks into steps, execute them one by one, verify after each change. Do NOT stop to ask for confirmation — keep going until the task is complete. Use Plan tool for 3+ steps, then auto-execute. After every Write/Edit, run Verify. If tests fail, fix and re-verify.',
  },
  plan: {
    name: 'Plan',
    emoji: '📋',
    description: 'Architect — plans first, waits for approval',
    behaviorPrompt: 'You are in PLAN mode. Before making ANY changes, submit a structured plan using the Plan tool. Describe what you will do, which files you will touch, and the risks. Wait for user approval before executing. Do NOT make changes without an approved plan.',
  },
};

export const MODE_ORDER: KarenMode[] = ['chat', 'code', 'agent', 'plan'];
