import { execSync } from 'child_process';
import { loadConfig } from './config.js';

/** Auto-create a git checkpoint before edits. Returns the commit hash or null. */
export function autoCheckpoint(cwd: string): string | null {
  const config = loadConfig();
  if (config.autoCheckpoint === false) return null;

  try {
    // Check if we're in a git repo
    execSync('git rev-parse --git-dir', { cwd, stdio: 'ignore' });
  } catch {
    return null; // Not a git repo, skip
  }

  try {
    // Stage all changes and commit with a karen-cli marker
    execSync('git add -A', { cwd, stdio: 'ignore' });
    const msg = `karen-checkpoint: ${new Date().toISOString()}`;
    execSync(`git commit -m "${msg}" --allow-empty`, { cwd, stdio: 'ignore' });
    const hash = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
    return hash;
  } catch {
    return null; // Nothing to commit or git error
  }
}

/** Rollback to N checkpoints ago. Returns a status message. */
export function gitRollback(count: number, cwd?: string): string {
  const dir = cwd || process.cwd();

  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'ignore' });
  } catch {
    return 'Not a git repository.';
  }

  try {
    const log = execSync(`git log --oneline -${count + 1}`, { cwd: dir, encoding: 'utf8' });
    const lines = log.trim().split('\n');

    // Find the last karen-checkpoint commits
    const checkpointIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('karen-checkpoint:')) {
        checkpointIndices.push(i);
      }
    }

    if (checkpointIndices.length === 0) {
      return 'No karen checkpoints found.';
    }

    const targetIdx = Math.min(count - 1, checkpointIndices.length - 1);
    const targetLine = lines[checkpointIndices[targetIdx]];
    const targetHash = targetLine.split(' ')[0];

    // Soft reset to that checkpoint (keeps working tree changes)
    execSync(`git reset --soft ${targetHash}`, { cwd: dir, stdio: 'ignore' });
    return `Rolled back ${Math.min(count, checkpointIndices.length)} checkpoint(s) to: ${targetLine}`;
  } catch (err) {
    return `Rollback failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
