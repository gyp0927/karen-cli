import { Tool, ToolResult } from '../core/types.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { safePath } from '../utils/paths.js';

interface EditRecord {
  timestamp: number;
  filePath: string;
  original: string;
  modified: string;
}

function isValidEditRecord(r: unknown): r is EditRecord {
  if (!r || typeof r !== 'object') return false;
  const obj = r as Record<string, unknown>;
  return (
    typeof obj.timestamp === 'number' &&
    typeof obj.filePath === 'string' &&
    typeof obj.original === 'string' &&
    typeof obj.modified === 'string'
  );
}

const HISTORY_DIR = join(homedir(), '.karen', 'history');

/** Encapsulates edit history state to enable test isolation and multi-instance support. */
export class EditHistoryStore {
  private editHistory: EditRecord[] = [];
  private historyLoaded = false;

  /** Reset in-memory state — exposed for test isolation. */
  reset(): void {
    this.editHistory = [];
    this.historyLoaded = true; // prevent re-loading from disk
  }

  /** Get the last edit record for /diff display. */
  getLastEdit(): EditRecord | null {
    this.loadHistory();
    if (this.editHistory.length === 0) return null;
    return this.editHistory[this.editHistory.length - 1];
  }

  /** Record an edit operation to history. */
  recordEdit(filePath: string, original: string, modified: string): void {
    this.loadHistory();
    this.editHistory.push({
      timestamp: Date.now(),
      filePath,
      original,
      modified,
    });
    this.saveHistory();
  }

  /** Get the full edit history. */
  getHistory(): EditRecord[] {
    this.loadHistory();
    return [...this.editHistory];
  }

  /** Remove entries at given indices (sorted descending) and save. */
  removeEntries(indices: number[]): void {
    for (const idx of indices) {
      this.editHistory.splice(idx, 1);
    }
    this.saveHistory();
  }

  private ensureHistoryDir(): void {
    if (!existsSync(HISTORY_DIR)) {
      mkdirSync(HISTORY_DIR, { recursive: true });
    }
  }

  private loadHistory(): void {
    if (this.historyLoaded) return;
    const path = join(HISTORY_DIR, 'edits.json');
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        if (Array.isArray(data)) {
          // Validate each entry to prevent prototype pollution
          this.editHistory = data.filter(isValidEditRecord);
        } else {
          this.editHistory = [];
        }
      } catch { /* ignore */ }
    }
    this.historyLoaded = true;
  }

  private saveHistory(): void {
    this.ensureHistoryDir();
    const path = join(HISTORY_DIR, 'edits.json');
    // Keep last 100 edits
    const trimmed = this.editHistory.slice(-100);
    writeFileSync(path, JSON.stringify(trimmed, null, 2), 'utf8');
  }
}

// Default global instance for backward compatibility
const defaultStore = new EditHistoryStore();

/** Reset in-memory edit history — exposed for test isolation. */
export function resetEditHistory(store?: EditHistoryStore): void {
  (store || defaultStore).reset();
}

/** Get the last edit record for /diff display. */
export function getLastEdit(store?: EditHistoryStore): EditRecord | null {
  return (store || defaultStore).getLastEdit();
}

/** Sensitive file patterns that should trigger a warning before editing. */
const SENSITIVE_FILE_PATTERNS = [
  /\.env/i,
  /\.env\./i,
  /id_rsa/i,
  /id_ed25519/i,
  /id_ecdsa/i,
  /id_dsa/i,
  /\.ssh[\/\\]/i,
  /\.aws[\/\\]/i,
  /\.npmrc/i,
  /\.pypirc/i,
  /netrc/i,
  /\.docker[\/\\]config\.json/i,
  /credentials/i,
  /secret/i,
  /token/i,
  /config\.json$/i,
];

function isSensitiveFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SENSITIVE_FILE_PATTERNS.some(p => p.test(lower));
}

/** Parse SEARCH/REPLACE blocks from a string. */
function parseSearchReplaceBlocks(text: string): { search: string; replace: string }[] {
  const blocks: { search: string; replace: string }[] = [];
  const markerSearch = '<<<<<<< SEARCH';
  const markerSep = '=======';
  const markerReplace = '>>>>>>> REPLACE';

  let cursor = 0;
  while (true) {
    const start = text.indexOf(markerSearch, cursor);
    if (start === -1) break;

    const sep = text.indexOf(markerSep, start + markerSearch.length);
    if (sep === -1) break;

    const end = text.indexOf(markerReplace, sep + markerSep.length);
    if (end === -1) break;

    const search = text.slice(start + markerSearch.length, sep).replace(/^\n/, '').replace(/\n$/, '');
    const replace = text.slice(sep + markerSep.length, end).replace(/^\n/, '').replace(/\n$/, '');

    blocks.push({ search, replace });
    cursor = end + markerReplace.length;
  }

  return blocks;
}

export function createEditTool(store?: EditHistoryStore): Tool {
  const s = store || defaultStore;
  return {
    name: 'Edit',
    description: 'Edit a file. Supports: (1) old_string/new_string replacement (exact or regex), (2) SEARCH/REPLACE blocks, (3) multi-file targets array for applying the same edit to many files. Warns when editing sensitive files like .env, SSH keys, or credential files.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to edit (use this OR targets)',
        },
        targets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to apply the same edit to. Use with search_replace for batch edits.',
        },
        old_string: {
          type: 'string',
          description: 'Exact text to replace (use this OR search_replace, not both). Supports regex if use_regex is true.',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text (use with old_string). Supports $1, $2 capture groups when use_regex is true.',
        },
        use_regex: {
          type: 'boolean',
          description: 'Optional. If true, treat old_string as a regular expression pattern.',
        },
        search_replace: {
          type: 'string',
          description: 'SEARCH/REPLACE blocks for complex edits. Format:\n<<<<<<< SEARCH\nold text\n=======\nnew text\n>>>>>>> REPLACE',
        },
      },
      required: [],
    },
    async execute(args): Promise<ToolResult> {
      try {
        // Support multi-file targets
        const rawTargets: string[] = Array.isArray(args.targets) && args.targets.length > 0
          ? args.targets.map(String)
          : args.file_path ? [String(args.file_path)] : [];

        if (rawTargets.length === 0) {
          return { success: false, output: '', error: 'Provide file_path or targets array.' };
        }

        // Sanitize all paths
        const targets = rawTargets.map(p => safePath(p)).filter((p): p is string => p !== null);
        if (targets.length === 0) {
          return { success: false, output: '', error: 'Invalid or unsafe file path(s).' };
        }

        // Check for sensitive files
        const sensitiveTargets = targets.filter(isSensitiveFile);
        if (sensitiveTargets.length > 0) {
          return {
            success: false,
            output: '',
            error: `⚠️ Refusing to edit sensitive file(s): ${sensitiveTargets.join(', ')}. These look like credentials, SSH keys, or config files. If you're sure, use a different tool or rename the file first.`,
          };
        }

        const hasOldNew = args.old_string !== undefined && args.new_string !== undefined;
        const hasBlocks = typeof args.search_replace === 'string' && args.search_replace.trim().length > 0;

        if (!hasOldNew && !hasBlocks) {
          return { success: false, output: '', error: 'Provide either (old_string + new_string) or search_replace.' };
        }

        // Defensive: reject empty old_string to prevent accidental massive replacements
        if (hasOldNew && String(args.old_string) === '') {
          return { success: false, output: '', error: 'old_string cannot be empty. Provide a non-empty string to replace.' };
        }

        // Apply the same edit to all target files
        const results: string[] = [];
        const allErrors: string[] = [];

        for (const filePath of targets) {
          const content = readFileSync(filePath, 'utf8');
          let newContent = content;
          const applied: string[] = [];
          const errors: string[] = [];

          if (hasOldNew) {
            const oldString = String(args.old_string);
            const newString = String(args.new_string);
            const useRegex = args.use_regex === true;

            if (useRegex) {
              try {
                const regex = new RegExp(oldString, 'g');
                const occurrences = (content.match(regex) || []).length;
                if (occurrences === 0) {
                  errors.push(`Regex pattern not found in ${filePath}`);
                } else {
                  newContent = content.replace(regex, newString);
                  applied.push(`${occurrences} regex replacement(s)`);
                }
              } catch (regexErr) {
                errors.push(`Invalid regex pattern: ${regexErr instanceof Error ? regexErr.message : String(regexErr)}`);
              }
            } else {
              if (!content.includes(oldString)) {
                errors.push(`old_string not found in ${filePath}`);
              } else {
                const occurrences = content.split(oldString).length - 1;
                newContent = content.replaceAll(oldString, newString);
                if (newContent !== content) applied.push(`${occurrences} replacement(s)`);
              }
            }
          }

          if (hasBlocks && errors.length === 0) {
            const blocks = parseSearchReplaceBlocks(String(args.search_replace));
            for (let i = 0; i < blocks.length; i++) {
              const { search, replace } = blocks[i];
              if (!newContent.includes(search)) {
                errors.push(`Block ${i + 1}: not found in ${filePath}`);
                continue;
              }
              const occurrences = newContent.split(search).length - 1;
              newContent = newContent.replaceAll(search, replace);
              if (newContent !== content) applied.push(`block ${i + 1} (${occurrences}x)`);
            }
          }

          if (errors.length > 0) {
            allErrors.push(...errors);
            if (targets.length === 1) {
              return { success: false, output: '', error: errors.join('; ') };
            }
            continue;
          }

          writeFileSync(filePath, newContent, 'utf8');
          s.recordEdit(filePath, content, newContent);
          results.push(`${filePath} (${applied.join(', ')})`);
        }

        if (results.length === 0 && allErrors.length > 0) {
          return { success: false, output: '', error: allErrors.join('; ') };
        }

        const msg = results.length > 0
          ? `Edited ${results.length} file(s): ${results.join(', ')}` + (allErrors.length > 0 ? `; skipped: ${allErrors.join('; ')}` : '')
          : 'No changes made.';
        return { success: results.length > 0, output: msg };
      } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function createUndoTool(store?: EditHistoryStore): Tool {
  const s = store || defaultStore;
  return {
    name: 'Undo',
    description: 'Undo the last edit operation, or all edits to a specific file. Use without arguments to undo the most recent change.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Optional. Undo the most recent edit to this specific file.',
        },
        count: {
          type: 'number',
          description: 'Optional. Number of recent edits to undo (default 1).',
        },
      },
    },
    async execute(args): Promise<ToolResult> {
      const history = s.getHistory();
      if (history.length === 0) {
        return { success: false, output: '', error: 'No edits to undo.' };
      }

      const filePath = args.file_path ? String(args.file_path) : undefined;
      const count = typeof args.count === 'number' ? Math.max(1, args.count) : 1;

      // Find matching edits
      const indices: number[] = [];
      for (let i = history.length - 1; i >= 0; i--) {
        if (!filePath || history[i].filePath === filePath) {
          indices.push(i);
          if (indices.length >= count) break;
        }
      }

      if (indices.length === 0) {
        return { success: false, output: '', error: filePath ? `No edits found for ${filePath}` : 'No edits to undo.' };
      }

      const undone: string[] = [];
      const skipped: string[] = [];
      // Sort descending to remove from end first
      indices.sort((a, b) => b - a);
      for (const idx of indices) {
        const record = history[idx];
        const current = readFileSync(record.filePath, 'utf8');
        if (current === record.modified) {
          writeFileSync(record.filePath, record.original, 'utf8');
          undone.push(record.filePath);
        } else {
          skipped.push(record.filePath);
        }
      }
      // Only remove history entries that were actually restored
      const removedIndices = indices.filter((_, i) => !skipped.includes(history[indices[i]].filePath));
      if (removedIndices.length > 0) {
        s.removeEntries(removedIndices);
      }

      if (undone.length === 0) {
        return {
          success: false,
          output: '',
          error: `Could not undo: file(s) have been modified since the edit. Skipped ${skipped.length} edit(s).`,
        };
      }

      return {
        success: true,
        output: `Undone ${undone.length} edit(s): ${[...new Set(undone)].join(', ')}${skipped.length > 0 ? `; skipped ${skipped.length} (file modified externally)` : ''}`,
      };
    },
  };
}
