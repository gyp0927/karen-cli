import { Tool, ToolResult } from '../core/types.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface EditRecord {
  timestamp: number;
  filePath: string;
  original: string;
  modified: string;
}

const HISTORY_DIR = join(homedir(), '.karen', 'history');
let editHistory: EditRecord[] = [];
let historyLoaded = false;

function ensureHistoryDir(): void {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function loadHistory(): void {
  if (historyLoaded) return;
  const path = join(HISTORY_DIR, 'edits.json');
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      editHistory = Array.isArray(data) ? data : [];
    } catch { /* ignore */ }
  }
  historyLoaded = true;
}

function saveHistory(): void {
  ensureHistoryDir();
  const path = join(HISTORY_DIR, 'edits.json');
  // Keep last 100 edits
  const trimmed = editHistory.slice(-100);
  writeFileSync(path, JSON.stringify(trimmed, null, 2), 'utf8');
}

function recordEdit(filePath: string, original: string, modified: string): void {
  loadHistory();
  editHistory.push({
    timestamp: Date.now(),
    filePath,
    original,
    modified,
  });
  saveHistory();
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

export function createEditTool(): Tool {
  return {
    name: 'Edit',
    description: 'Edit a file. Supports two modes: (1) exact string replacement with old_string/new_string, or (2) SEARCH/REPLACE blocks for multi-location edits. Use SEARCH/REPLACE when changing multiple places in one file.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'Exact text to replace (use this OR search_replace, not both)',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text (use with old_string)',
        },
        search_replace: {
          type: 'string',
          description: 'SEARCH/REPLACE blocks for complex edits. Format:\n<<<<<<< SEARCH\nold text\n=======\nnew text\n>>>>>>> REPLACE',
        },
      },
      required: ['file_path'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const filePath = String(args.file_path);
        const hasOldNew = args.old_string !== undefined && args.new_string !== undefined;
        const hasBlocks = typeof args.search_replace === 'string' && args.search_replace.trim().length > 0;

        if (!hasOldNew && !hasBlocks) {
          return { success: false, output: '', error: 'Provide either (old_string + new_string) or search_replace.' };
        }

        const content = readFileSync(filePath, 'utf8');
        let newContent = content;
        const applied: string[] = [];
        const errors: string[] = [];

        if (hasOldNew) {
          const oldString = String(args.old_string);
          const newString = String(args.new_string);

          if (!content.includes(oldString)) {
            return { success: false, output: '', error: `old_string not found in ${filePath}` };
          }

          newContent = content.replace(oldString, newString);
          if (newContent === content) {
            return { success: false, output: '', error: 'old_string matched but replace had no effect.' };
          }
          applied.push('1 replacement');
        }

        if (hasBlocks) {
          const blocks = parseSearchReplaceBlocks(String(args.search_replace));
          if (blocks.length === 0) {
            return { success: false, output: '', error: 'No valid SEARCH/REPLACE blocks found. Check formatting.' };
          }

          for (let i = 0; i < blocks.length; i++) {
            const { search, replace } = blocks[i];
            if (!newContent.includes(search)) {
              errors.push(`Block ${i + 1}: SEARCH text not found`);
              continue;
            }
            newContent = newContent.replace(search, replace);
            applied.push(`block ${i + 1}`);
          }

          if (errors.length > 0 && applied.length === 0) {
            return { success: false, output: '', error: errors.join('; ') };
          }
        }

        writeFileSync(filePath, newContent, 'utf8');
        recordEdit(filePath, content, newContent);

        const msg = `Edited ${filePath}` + (applied.length > 0 ? ` (${applied.join(', ')})` : '') + (errors.length > 0 ? `; warnings: ${errors.join('; ')}` : '');
        return { success: true, output: msg };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}

export function createUndoTool(): Tool {
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
      loadHistory();
      if (editHistory.length === 0) {
        return { success: false, output: '', error: 'No edits to undo.' };
      }

      const filePath = args.file_path ? String(args.file_path) : undefined;
      const count = typeof args.count === 'number' ? Math.max(1, args.count) : 1;

      // Find matching edits
      const indices: number[] = [];
      for (let i = editHistory.length - 1; i >= 0; i--) {
        if (!filePath || editHistory[i].filePath === filePath) {
          indices.push(i);
          if (indices.length >= count) break;
        }
      }

      if (indices.length === 0) {
        return { success: false, output: '', error: filePath ? `No edits found for ${filePath}` : 'No edits to undo.' };
      }

      const undone: string[] = [];
      // Sort descending to remove from end first
      indices.sort((a, b) => b - a);
      for (const idx of indices) {
        const record = editHistory[idx];
        const current = readFileSync(record.filePath, 'utf8');
        if (current === record.modified) {
          writeFileSync(record.filePath, record.original, 'utf8');
          undone.push(record.filePath);
        }
        editHistory.splice(idx, 1);
      }
      saveHistory();

      return {
        success: true,
        output: `Undone ${indices.length} edit(s): ${[...new Set(undone)].join(', ')}`,
      };
    },
  };
}
