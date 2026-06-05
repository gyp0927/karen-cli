/** Shared constants used across the codebase. */

export const LIMITS = {
  /** Max token budget before compaction kicks in. */
  MAX_TOKEN_BUDGET: 120_000,
  /** Max output chars per tool result before truncation. */
  MAX_TOOL_OUTPUT: 100_000,
  /** Max response body bytes for web fetch. */
  MAX_FETCH_BYTES: 5 * 1024 * 1024,
  /** Max stdout bytes for bash commands. */
  MAX_BASH_OUTPUT: 2 * 1024 * 1024,
  /** Max grep result lines. */
  MAX_GREP_RESULTS: 500,
  /** Max transcript file size before rotation. */
  MAX_TRANSCRIPT_SIZE: 50 * 1024 * 1024,
  /** Max history entries in REPL. */
  MAX_HISTORY: 200,
  /** Max conversation turns kept in session.json. */
  MAX_SESSION_TURNS: 50,
  /** Max regex pattern length for grep. */
  MAX_GREP_PATTERN: 1000,
  /** Max ready_pattern length for background jobs. */
  MAX_READY_PATTERN: 200,
} as const;

export const TIMEOUTS = {
  /** Default request timeout for LLM calls. */
  LLM_REQUEST: 120_000,
  /** Per-chunk read timeout for streaming. */
  STREAM_CHUNK: 60_000,
  /** Web fetch timeout. */
  WEB_FETCH: 30_000,
  /** Web search timeout. */
  WEB_SEARCH: 20_000,
  /** Weather API timeout. */
  WEATHER: 15_000,
  /** MCP connect timeout. */
  MCP_CONNECT: 30_000,
  /** Bash foreground timeout. */
  BASH_FOREGROUND: 120_000,
  /** Bash background ready timeout. */
  BASH_READY: 30_000,
  /** Verify tool timeout. */
  VERIFY: 120_000,
} as const;

export const DEFAULTS = {
  /** Default max iterations per agent loop. */
  MAX_ITERATIONS: 50,
  /** Hard cap on total iterations. */
  HARD_ITERATION_CAP: 200,
  /** Context compactor max tokens. */
  COMPACTOR_MAX_TOKENS: 80_000,
  /** Context compactor keep recent count. */
  COMPACTOR_KEEP_RECENT: 20,
  /** Max sub-agent iterations. */
  SUB_AGENT_ITERATIONS: 5,
  /** Repeat guard max repeats. */
  REPEAT_GUARD_MAX: 2,
  /** Repeat guard window size. */
  REPEAT_GUARD_WINDOW: 10,
  /** Circuit breaker threshold. */
  CIRCUIT_THRESHOLD: 5,
  /** Circuit breaker cooldown ms. */
  CIRCUIT_COOLDOWN: 30_000,
  /** Retry base delay ms. */
  RETRY_BASE_DELAY: 1_000,
} as const;
