export const SENSITIVE_TOOLS = ['Bash', 'Write', 'Edit'];

// Bash commands that are considered safe / read-only and don't need confirmation.
const SAFE_BASH_PREFIXES = [
  'curl ', 'wget ', 'cat ', 'ls ', 'echo ', 'grep ', 'rg ', 'head ', 'tail ', 'find ',
  'pwd', 'whoami', 'date', 'uname', 'which ', 'where ', 'git status', 'git log', 'git diff',
  'git branch', 'git show', 'git remote', 'npm list', 'npm view', 'npx --version',
  'node --version', 'node -v', 'python --version', 'python -V', 'java -version',
  'python -m pytest', 'pytest',
];

// Compound commands using && where the first part is just cd
const SAFE_COMPOUND_FIRST_PARTS = ['cd ', 'dir', 'echo '];

// Bash commands or operators that are considered dangerous and MUST be confirmed.
const DANGEROUS_BASH_PATTERNS = [
  /\brm\b/, /\bdd\b/, /\bchmod\b/, /\bchown\b/, /\bsudo\b/, /\bsu\b/,
  />/, /\|\s*rm\b/, /\|\s*sh\b/, /\|\s*bash\b/, /eval\s/, /source\s/,
  /curl.+\|\s*sh/, /wget.+\|\s*sh/, /\`.*rm/, /\$\(.*rm/,
];

/**
 * Determine if a Bash command requires user confirmation.
 * Safe read-only commands (curl, ls, git status, etc.) are auto-allowed.
 * Dangerous commands (rm, sudo, redirects, piped shells) require confirmation.
 * Write/Edit tools always require confirmation regardless of content.
 */
export function isBashDangerous(command: string): boolean {
  const trimmed = command.trim();

  // Explicitly safe prefixes → no confirmation
  for (const prefix of SAFE_BASH_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return false;
    }
  }

  // Compound commands like "cd X && safe-command" — check the part after &&
  const andParts = trimmed.split(/\s*&&\s*/);
  if (andParts.length > 1) {
    const first = andParts[0].trim();
    const rest = andParts.slice(1).join(' && ');
    // If first part is just cd/dir/echo and rest is safe, allow it
    const firstIsSafe = SAFE_COMPOUND_FIRST_PARTS.some(p => first.startsWith(p));
    if (firstIsSafe && !isBashDangerous(rest)) {
      return false;
    }
  }

  // Dangerous patterns → require confirmation
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  // Default: unknown commands require confirmation to be safe
  return true;
}

export interface PermissionPolicy {
  allowAll: boolean;
  allowedTools: string[];
  deniedTools: string[];
}

export const DEFAULT_POLICY: PermissionPolicy = {
  allowAll: false,
  allowedTools: [],
  deniedTools: [],
};
