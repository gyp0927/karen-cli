export type MemoryType = 'user' | 'feedback' | 'project' | 'global' | 'skill' | 'reference';

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  /** Summarized content if the original was too long. */
  summary?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** Expiration timestamp. After this time the memory is auto-deleted. */
  expiresAt?: number;
  /** Content hash for fast deduplication checks. */
  contentHash?: string;
  /** Whether this memory is a duplicate that was merged. */
  merged?: boolean;
  /** IDs of memories that were merged into this one. */
  mergedIds?: string[];
  /** Priority level: high priority items are always loaded into context. */
  priority?: 'high' | 'medium' | 'low';
}

export interface MemoryInput {
  type: MemoryType;
  content: string;
  tags?: string[];
  /** TTL in days. Overrides default per-type TTL if set. */
  ttlDays?: number;
  /** If true, skip deduplication check. */
  force?: boolean;
  /** Priority level. High priority memories are always loaded into context. */
  priority?: 'high' | 'medium' | 'low';
}

export interface MemoryQuery {
  type?: string;
  tags?: string[];
  keywords?: string[];
  /** If true, include expired memories (normally filtered out). */
  includeExpired?: boolean;
  /** Filter by priority level. */
  priority?: 'high' | 'medium' | 'low';
}

/** Default TTL per memory type in days. 0 or negative means permanent (never expires). */
export const DEFAULT_TTL: Record<MemoryType, number> = {
  project: 30,
  global: 90,
  user: 0,      // permanent
  skill: 180,
  feedback: 7,
  reference: 30,
};

/** Max content length before auto-summarization kicks in. */
export const SUMMARIZE_THRESHOLD = 2000;

/** Max length of auto-generated summary. */
export const SUMMARY_MAX_LENGTH = 400;
