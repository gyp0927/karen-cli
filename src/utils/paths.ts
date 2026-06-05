import { resolve, normalize } from 'path';

/**
 * Sanitize a file path to prevent directory traversal attacks.
 * Ensures the resolved path stays within the project root.
 * Returns null if the path is suspicious.
 */
export function safePath(inputPath: string, root?: string): string | null {
  const cwd = root || process.cwd();

  // Reject empty paths
  if (!inputPath || inputPath.trim().length === 0) return null;

  // Reject paths containing null bytes (classic injection)
  if (inputPath.includes('\0')) return null;

  // Resolve and normalize
  let resolved: string;
  try {
    resolved = resolve(cwd, inputPath);
  } catch {
    return null;
  }

  resolved = normalize(resolved);

  // Reject any .. segments after normalization
  const segments = resolved.split(/[/\\]/);
  if (segments.includes('..')) return null;

  // Ensure resolved path stays within cwd
  const normalizedCwd = normalize(cwd);
  const isWindows = process.platform === 'win32';
  const checkResolved = isWindows ? resolved.toLowerCase() : resolved;
  const checkCwd = isWindows ? normalizedCwd.toLowerCase() : normalizedCwd;

  if (!checkResolved.startsWith(checkCwd)) return null;

  return resolved;
}
