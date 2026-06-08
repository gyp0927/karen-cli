import { resolve, normalize, join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

/**
 * Get the configuration directory, respecting XDG Base Directory Specification.
 * On Linux/Unix: uses $XDG_CONFIG_HOME or ~/.config/karen
 * On Windows: uses %LOCALAPPDATA%\karen or ~/.karen
 * Creates the directory if it doesn't exist.
 */
export function getConfigDir(): string {
  const isWindows = process.platform === 'win32';
  
  // Check XDG_CONFIG_HOME (Linux/Unix standard)
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    const dir = join(xdgConfigHome, 'karen');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }
  
  // Check Windows LOCALAPPDATA
  if (isWindows && process.env.LOCALAPPDATA) {
    const dir = join(process.env.LOCALAPPDATA, 'karen');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }
  
  // Fallback to ~/.config/karen (Unix) or ~/.karen (Windows legacy)
  const home = homedir();
  const dir = isWindows ? join(home, '.karen') : join(home, '.config', 'karen');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

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
