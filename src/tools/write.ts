import { Tool, ToolResult } from '../core/types.js';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { requireString } from './helpers.js';
import { safePath, getConfigDir } from '../utils/paths.js';
import { Logger } from '../utils/logger.js';

const BACKUP_DIR = join(getConfigDir(), 'backups');

/** Sensitive file patterns that should trigger a warning before writing. */
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

function ensureBackupDir(): void {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function createBackup(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${basename(filePath)}.${timestamp}.bak`;
    const backupPath = join(BACKUP_DIR, backupName);
    copyFileSync(filePath, backupPath);
    return backupPath;
  } catch (err) {
    Logger.warn(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function createWriteTool(): Tool {
  return {
    name: 'Write',
    description: 'Write content to a file. Overwrites if the file exists. Creates a backup of the original file before overwriting. Warns when writing to sensitive files like .env, SSH keys, or credential files.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to write' },
        content: { type: 'string', description: 'Content to write to the file' },
        no_backup: { type: 'boolean', description: 'Optional. If true, skip creating a backup of the original file.' },
      },
      required: ['file_path', 'content'],
    },
    async execute(args): Promise<ToolResult> {
      const rawPath = requireString(args, 'file_path');
      if (typeof rawPath !== 'string') return { success: false, output: '', error: rawPath.error };
      const filePath = safePath(rawPath);
      if (!filePath) return { success: false, output: '', error: 'Invalid or unsafe file path.' };
      const content = requireString(args, 'content');
      if (typeof content !== 'string') return { success: false, output: '', error: content.error };
      const noBackup = args.no_backup === true;

      if (isSensitiveFile(filePath)) {
        return {
          success: false,
          output: '',
          error: `⚠️ Refusing to write to sensitive file: ${filePath}. This looks like a credentials, SSH key, or config file. If you're sure, use a different tool or rename the file first.`,
        };
      }

      try {
        let backupPath: string | null = null;
        if (!noBackup) {
          backupPath = createBackup(filePath);
        }

        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content, 'utf8');

        const msg = backupPath
          ? `Wrote ${filePath} (backup: ${backupPath})`
          : `Wrote ${filePath}`;
        return { success: true, output: msg };
      } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
