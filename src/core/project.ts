import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface ProjectInfo {
  language: string;
  framework?: string;
  packageManager?: string;
  testCommand?: string;
  lintCommand?: string;
  hints: string[];
}

const DETECTORS: Array<{ files: string[]; detect: (dir: string) => ProjectInfo | null }> = [
  {
    files: ['package.json'],
    detect(dir) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        let framework = '';
        if (deps['next']) framework = 'Next.js';
        else if (deps['react']) framework = 'React';
        else if (deps['vue']) framework = 'Vue';
        else if (deps['express']) framework = 'Express';

        const testCmd = deps['vitest'] ? 'npx vitest run' : deps['jest'] ? 'npx jest' : deps['mocha'] ? 'npx mocha' : 'npm test';
        const lintCmd = deps['eslint'] ? 'npx eslint .' : '';

        const hints: string[] = [];
        if (existsSync(join(dir, 'tsconfig.json'))) hints.push('TypeScript project — use tsc --noEmit for type checking');
        if (deps['typescript']) hints.push('TypeScript is a dependency');
        if (framework) hints.push(`Framework: ${framework}`);

        return {
          language: 'JavaScript/TypeScript',
          framework: framework || undefined,
          packageManager: existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(dir, 'yarn.lock')) ? 'yarn' : 'npm',
          testCommand: testCmd,
          lintCommand: lintCmd || undefined,
          hints,
        };
      } catch { return null; }
    },
  },
  {
    files: ['Cargo.toml'],
    detect(dir) {
      return {
        language: 'Rust',
        testCommand: 'cargo test',
        lintCommand: 'cargo clippy',
        hints: ['Rust project — use cargo build, cargo test, cargo clippy'],
      };
    },
  },
  {
    files: ['go.mod'],
    detect(dir) {
      return {
        language: 'Go',
        testCommand: 'go test ./...',
        lintCommand: 'go vet ./...',
        hints: ['Go project — use go build, go test, go vet'],
      };
    },
  },
  {
    files: ['requirements.txt', 'pyproject.toml', 'setup.py'],
    detect(dir) {
      const hasPyproject = existsSync(join(dir, 'pyproject.toml'));
      return {
        language: 'Python',
        testCommand: hasPyproject ? 'pytest' : 'python -m pytest',
        hints: ['Python project — use pytest for testing, pip install for dependencies'],
      };
    },
  },
  {
    files: ['Gemfile'],
    detect() {
      return { language: 'Ruby', testCommand: 'bundle exec rspec', hints: ['Ruby project — use bundle exec rspec for testing'] };
    },
  },
];

export function detectProject(cwd: string): ProjectInfo | null {
  for (const detector of DETECTORS) {
    const hasAllFiles = detector.files.every(f => existsSync(join(cwd, f)));
    if (hasAllFiles) {
      const info = detector.detect(cwd);
      if (info) return info;
    }
  }
  return null;
}

export function buildProjectHints(cwd: string): string {
  const info = detectProject(cwd);
  if (!info) return '';

  const parts: string[] = [];
  parts.push(`\n\n--- Project Detection ---`);
  parts.push(`Language: ${info.language}`);
  if (info.framework) parts.push(`Framework: ${info.framework}`);
  if (info.packageManager) parts.push(`Package manager: ${info.packageManager}`);
  if (info.testCommand) parts.push(`Test command: \`${info.testCommand}\``);
  if (info.lintCommand) parts.push(`Lint command: \`${info.lintCommand}\``);
  if (info.hints.length > 0) parts.push(`Hints: ${info.hints.join('; ')}`);
  parts.push('Use the detected tools when making changes. Always run the test command after code changes.');

  return parts.join('\n');
}
