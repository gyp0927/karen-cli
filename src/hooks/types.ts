export type HookName =
  | 'pre-message'
  | 'post-tool'
  | 'pre-exit'
  | 'pre-loop'
  | 'post-loop';

export type HookCallback = (context: Record<string, unknown>) => Promise<void> | void;
