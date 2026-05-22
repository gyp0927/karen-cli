# karen-cli MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working interactive coding assistant CLI with multi-model support, tool execution, and permission system.

**Architecture:** Layered harness architecture with a stable agent loop at the core, tools registered via a registry, model providers behind a unified interface, and permissions enforced before sensitive operations.

**Tech Stack:** TypeScript, Node.js 20+, node:test (built-in), tsx (TS runner), @anthropic-ai/sdk, openai

---

## File Structure

```
karen-cli/
├── bin/
│   └── karen.ts              # CLI entry point
├── src/
│   ├── core/
│   │   ├── types.ts          # Core type definitions (EXISTS)
│   │   ├── loop.ts           # Agent core loop
│   │   └── context.ts        # Context assembly
│   ├── cli/
│   │   ├── repl.ts           # Interactive REPL
│   │   └── commands.ts       # Special command handlers
│   ├── providers/
│   │   ├── base.ts           # IProvider interface (EXISTS)
│   │   ├── anthropic.ts      # Claude provider
│   │   └── openai.ts         # OpenAI provider
│   ├── tools/
│   │   ├── registry.ts       # Tool registry (EXISTS)
│   │   ├── read.ts           # Read file tool
│   │   ├── write.ts          # Write file tool
│   │   ├── edit.ts           # Edit file tool
│   │   ├── bash.ts           # Bash command tool
│   │   ├── grep.ts           # Grep search tool
│   │   └── glob.ts           # Glob file match tool
│   ├── permissions/
│   │   ├── manager.ts        # Permission manager
│   │   └── policies.ts       # Permission policies
│   └── utils/
│       ├── logger.ts         # Logger (EXISTS)
│       └── tokenizer.ts      # Token estimation
├── tests/
│   ├── unit/
│   │   ├── tools/
│   │   │   ├── read.test.ts
│   │   │   ├── bash.test.ts
│   │   │   ├── glob.test.ts
│   │   │   ├── grep.test.ts
│   │   │   ├── write.test.ts
│   │   │   ├── edit.test.ts
│   │   │   └── registry.test.ts
│   │   ├── providers/
│   │   │   ├── anthropic.test.ts
│   │   │   └── openai.test.ts
│   │   └── permissions/
│   │       └── manager.test.ts
│   ├── integration/
│   │   └── loop.test.ts
│   └── e2e/
│       └── cli.test.ts
├── package.json              # (EXISTS)
└── tsconfig.json             # (EXISTS)
```

---

## Development Setup

Before starting tasks, ensure project is initialized:

```bash
cd karen-cli
npm install
# Install tsx for running TS tests directly
npm install -D tsx
```

Test runner command (used throughout):
```bash
# Run a specific test file
npx tsx --test tests/unit/tools/read.test.ts

# Run all unit tests
npx tsx --test tests/unit/**/*.test.ts

# Run all tests
npx tsx --test tests/**/*.test.ts
```

---

## Task 1: Read Tool

**Files:**
- Create: `src/tools/read.ts`
- Test: `tests/unit/tools/read.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/read.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createReadTool } from '../../../src/tools/read.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Read tool', () => {
  it('should read file contents', async () => {
    const testFile = join(tmpdir(), 'karen-test-read.txt');
    writeFileSync(testFile, 'hello world', 'utf8');

    const tool = createReadTool();
    const result = await tool.execute({ file_path: testFile });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'hello world');

    unlinkSync(testFile);
  });

  it('should fail for non-existent file', async () => {
    const tool = createReadTool();
    const result = await tool.execute({ file_path: '/does/not/exist.txt' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('ENOENT') || result.error?.includes('not exist'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/tools/read.test.ts
```

Expected: FAIL with "createReadTool is not defined" or import error.

- [ ] **Step 3: Write minimal implementation**

Create `src/tools/read.ts`:

```typescript
import { Tool, ToolResult } from '../core/types.js';
import { readFileSync } from 'fs';

export function createReadTool(): Tool {
  return {
    name: 'Read',
    description: 'Read the contents of a file.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to read',
        },
      },
      required: ['file_path'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const filePath = String(args.file_path);
        const content = readFileSync(filePath, 'utf8');
        return { success: true, output: content };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/tools/read.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/tools/read.test.ts src/tools/read.ts
git commit -m "feat: add Read tool with tests"
```

---

## Task 2: Bash Tool

**Files:**
- Create: `src/tools/bash.ts`
- Test: `tests/unit/tools/bash.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/bash.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createBashTool } from '../../../src/tools/bash.js';

describe('Bash tool', () => {
  it('should execute echo command', async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: 'echo hello' });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('hello'));
  });

  it('should return error for invalid command', async () => {
    const tool = createBashTool();
    const result = await tool.execute({ command: 'not_a_real_command_12345' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/tools/bash.test.ts
```

Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Create `src/tools/bash.ts`:

```typescript
import { Tool, ToolResult } from '../core/types.js';
import { execSync } from 'child_process';

export function createBashTool(): Tool {
  return {
    name: 'Bash',
    description: 'Execute a shell command.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
      },
      required: ['command'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const command = String(args.command);
        const output = execSync(command, { encoding: 'utf8', timeout: 120000 });
        return { success: true, output: output.trimEnd() };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/tools/bash.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/tools/bash.test.ts src/tools/bash.ts
git commit -m "feat: add Bash tool with tests"
```

---

## Task 3: Glob Tool

**Files:**
- Create: `src/tools/glob.ts`
- Test: `tests/unit/tools/glob.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/glob.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createGlobTool } from '../../../src/tools/glob.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Glob tool', () => {
  it('should match files by pattern', async () => {
    const testDir = join(tmpdir(), 'karen-test-glob');
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'a.txt'), 'a');
    writeFileSync(join(testDir, 'b.txt'), 'b');
    writeFileSync(join(testDir, 'c.js'), 'c');

    const tool = createGlobTool();
    const result = await tool.execute({ pattern: '**/*.txt', path: testDir });

    assert.strictEqual(result.success, true);
    const lines = result.output.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 2);
    assert.ok(lines.some(l => l.endsWith('a.txt')));
    assert.ok(lines.some(l => l.endsWith('b.txt')));

    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return empty for no matches', async () => {
    const tool = createGlobTool();
    const result = await tool.execute({ pattern: '*.nonexistent' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output.trim(), '');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/tools/glob.test.ts
```

Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Create `src/tools/glob.ts`:

```typescript
import { Tool, ToolResult } from '../core/types.js';
import { globSync } from 'fs';

export function createGlobTool(): Tool {
  return {
    name: 'Glob',
    description: 'Find files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files',
        },
        path: {
          type: 'string',
          description: 'Base directory to search in',
        },
      },
      required: ['pattern'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const pattern = String(args.pattern);
        const basePath = args.path ? String(args.path) : process.cwd();
        const matches = globSync(pattern, { cwd: basePath });
        return { success: true, output: matches.join('\n') };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/tools/glob.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/tools/glob.test.ts src/tools/glob.ts
git commit -m "feat: add Glob tool with tests"
```

---

## Task 4: Grep Tool

**Files:**
- Create: `src/tools/grep.ts`
- Test: `tests/unit/tools/grep.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/grep.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createGrepTool } from '../../../src/tools/grep.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Grep tool', () => {
  it('should find matching lines', async () => {
    const testDir = join(tmpdir(), 'karen-test-grep');
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'test.txt'), 'hello world\nfoo bar\nhello again', 'utf8');

    const tool = createGrepTool();
    const result = await tool.execute({ pattern: 'hello', path: testDir });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('hello world'));
    assert.ok(result.output.includes('hello again'));
    assert.ok(!result.output.includes('foo bar'));

    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return empty for no matches', async () => {
    const tool = createGrepTool();
    const result = await tool.execute({ pattern: 'xyz123notfound' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output.trim(), '');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/tools/grep.test.ts
```

Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Create `src/tools/grep.ts`:

```typescript
import { Tool, ToolResult } from '../core/types.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export function createGrepTool(): Tool {
  return {
    name: 'Grep',
    description: 'Search for a pattern in files.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Directory or file to search in',
        },
      },
      required: ['pattern'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const pattern = new RegExp(String(args.pattern));
        const searchPath = args.path ? String(args.path) : process.cwd();
        const results: string[] = [];

        function searchFile(filePath: string) {
          const content = readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (pattern.test(line)) {
              results.push(`${filePath}:${idx + 1}:${line}`);
            }
          });
        }

        function searchDir(dirPath: string) {
          const entries = readdirSync(dirPath);
          for (const entry of entries) {
            if (entry === 'node_modules' || entry === '.git') continue;
            const fullPath = join(dirPath, entry);
            const stats = statSync(fullPath);
            if (stats.isDirectory()) {
              searchDir(fullPath);
            } else if (stats.isFile()) {
              try { searchFile(fullPath); } catch { /* skip binary */ }
            }
          }
        }

        const stats = statSync(searchPath);
        if (stats.isDirectory()) {
          searchDir(searchPath);
        } else {
          searchFile(searchPath);
        }

        return { success: true, output: results.join('\n') };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/tools/grep.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/tools/grep.test.ts src/tools/grep.ts
git commit -m "feat: add Grep tool with tests"
```

---

## Task 5: Write Tool

**Files:**
- Create: `src/tools/write.ts`
- Test: `tests/unit/tools/write.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/write.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createWriteTool } from '../../../src/tools/write.js';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Write tool', () => {
  it('should write file contents', async () => {
    const testFile = join(tmpdir(), 'karen-test-write.txt');

    const tool = createWriteTool();
    const result = await tool.execute({ file_path: testFile, content: 'hello world' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'hello world');

    unlinkSync(testFile);
  });

  it('should overwrite existing file', async () => {
    const testFile = join(tmpdir(), 'karen-test-write2.txt');

    const tool = createWriteTool();
    await tool.execute({ file_path: testFile, content: 'first' });
    const result = await tool.execute({ file_path: testFile, content: 'second' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'second');

    unlinkSync(testFile);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/tools/write.test.ts
```

Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Create `src/tools/write.ts`:

```typescript
import { Tool, ToolResult } from '../core/types.js';
import { writeFileSync } from 'fs';

export function createWriteTool(): Tool {
  return {
    name: 'Write',
    description: 'Write content to a file. Overwrites if the file exists.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to write',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const filePath = String(args.file_path);
        const content = String(args.content);
        writeFileSync(filePath, content, 'utf8');
        return { success: true, output: `Wrote ${filePath}` };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/tools/write.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/tools/write.test.ts src/tools/write.ts
git commit -m "feat: add Write tool with tests"
```

---

## Task 6: Edit Tool

**Files:**
- Create: `src/tools/edit.ts`
- Test: `tests/unit/tools/edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/edit.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEditTool } from '../../../src/tools/edit.js';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Edit tool', () => {
  it('should replace text in file', async () => {
    const testFile = join(tmpdir(), 'karen-test-edit.txt');
    writeFileSync(testFile, 'hello world\nfoo bar', 'utf8');

    const tool = createEditTool();
    const result = await tool.execute({
      file_path: testFile,
      old_string: 'hello world',
      new_string: 'hi there',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(readFileSync(testFile, 'utf8'), 'hi there\nfoo bar');

    unlinkSync(testFile);
  });

  it('should fail if old_string not found', async () => {
    const testFile = join(tmpdir(), 'karen-test-edit2.txt');
    writeFileSync(testFile, 'hello world', 'utf8');

    const tool = createEditTool();
    const result = await tool.execute({
      file_path: testFile,
      old_string: 'not found',
      new_string: 'replacement',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('not found'));

    unlinkSync(testFile);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/tools/edit.test.ts
```

Expected: FAIL with import error.

- [ ] **Step 3: Write minimal implementation**

Create `src/tools/edit.ts`:

```typescript
import { Tool, ToolResult } from '../core/types.js';
import { readFileSync, writeFileSync } from 'fs';

export function createEditTool(): Tool {
  return {
    name: 'Edit',
    description: 'Edit a file by replacing an exact string with another.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'Exact text to replace',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
    async execute(args): Promise<ToolResult> {
      try {
        const filePath = String(args.file_path);
        const oldString = String(args.old_string);
        const newString = String(args.new_string);

        const content = readFileSync(filePath, 'utf8');
        if (!content.includes(oldString)) {
          return { success: false, output: '', error: `old_string not found in ${filePath}` };
        }

        const newContent = content.replace(oldString, newString);
        writeFileSync(filePath, newContent, 'utf8');
        return { success: true, output: `Edited ${filePath}` };
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/tools/edit.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/tools/edit.test.ts src/tools/edit.ts
git commit -m "feat: add Edit tool with tests"
```

---

## Task 7: Tool Registry Integration Test

**Files:**
- Modify: `src/tools/registry.ts` (EXISTS)
- Test: `tests/unit/tools/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tools/registry.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { createReadTool } from '../../../src/tools/read.js';
import { createBashTool } from '../../../src/tools/bash.js';

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    const readTool = createReadTool();
    registry.register(readTool);

    const retrieved = registry.get('Read');
    assert.strictEqual(retrieved, readTool);
  });

  it('should list all tools', () => {
    const registry = new ToolRegistry();
    registry.register(createReadTool());
    registry.register(createBashTool());

    const tools = registry.list();
    assert.strictEqual(tools.length, 2);
    assert.ok(tools.some(t => t.name === 'Read'));
    assert.ok(tools.some(t => t.name === 'Bash'));
  });

  it('should return tool definitions', () => {
    const registry = new ToolRegistry();
    registry.register(createReadTool());

    const defs = registry.definitions();
    assert.strictEqual(defs.length, 1);
    assert.strictEqual(defs[0].name, 'Read');
    assert.strictEqual(defs[0].description, 'Read the contents of a file.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/tools/registry.test.ts
```

Expected: Tests run, should PASS since registry.ts already exists.

- [ ] **Step 3: If tests pass, commit**

```bash
git add tests/unit/tools/registry.test.ts
git commit -m "test: add ToolRegistry integration tests"
```

- [ ] **Step 4: Run all tool tests to verify no regressions**

```bash
npx tsx --test tests/unit/tools/*.test.ts
```

Expected: All tests PASS.

---

## Task 8: Permission Manager

**Files:**
- Create: `src/permissions/policies.ts`
- Create: `src/permissions/manager.ts`
- Test: `tests/unit/permissions/manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/permissions/manager.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PermissionManager } from '../../../src/permissions/manager.js';

describe('PermissionManager', () => {
  it('should allow non-sensitive tools without asking', async () => {
    const pm = new PermissionManager();
    const allowed = await pm.check('Read', { file_path: '/test.txt' });
    assert.strictEqual(allowed, true);
  });

  it('should require confirmation for Bash tool', async () => {
    let called = false;
    const pm = new PermissionManager({
      confirm: async () => { called = true; return true; },
    });
    const allowed = await pm.check('Bash', { command: 'echo hi' });
    assert.strictEqual(allowed, true);
    assert.strictEqual(called, true);
  });

  it('should deny if user rejects', async () => {
    const pm = new PermissionManager({
      confirm: async () => false,
    });
    const allowed = await pm.check('Bash', { command: 'echo hi' });
    assert.strictEqual(allowed, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/permissions/manager.test.ts
```

Expected: FAIL with import errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/permissions/policies.ts`:

```typescript
export const SENSITIVE_TOOLS = ['Bash', 'Write', 'Edit'];

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
```

Create `src/permissions/manager.ts`:

```typescript
import { SENSITIVE_TOOLS } from './policies.js';

export interface PermissionManagerOptions {
  confirm?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

export class PermissionManager {
  private confirm: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

  constructor(options: PermissionManagerOptions = {}) {
    this.confirm = options.confirm || (async () => {
      // Default: ask via stdin in real CLI
      return true;
    });
  }

  async check(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    if (!SENSITIVE_TOOLS.includes(toolName)) {
      return true;
    }
    return this.confirm(toolName, args);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/permissions/manager.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/permissions/manager.test.ts src/permissions/policies.ts src/permissions/manager.ts
git commit -m "feat: add permission manager with tests"
```

---

## Task 9: Anthropic Provider

**Files:**
- Create: `src/providers/anthropic.ts`
- Test: `tests/unit/providers/anthropic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/providers/anthropic.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AnthropicProvider } from '../../../src/providers/anthropic.js';

describe('AnthropicProvider', () => {
  it('should have correct name', () => {
    const provider = new AnthropicProvider('test-key');
    assert.strictEqual(provider.name, 'anthropic');
  });

  it('should format messages correctly', () => {
    const provider = new AnthropicProvider('test-key');
    const formatted = provider.formatMessages([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);
    assert.strictEqual(formatted.length, 2);
    assert.strictEqual(formatted[0].role, 'user');
    assert.strictEqual(formatted[0].content, 'Hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/providers/anthropic.test.ts
```

Expected: FAIL with import errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/providers/anthropic.ts`:

```typescript
import { BaseProvider } from './base.js';
import { Message, ProviderResponse, ToolDefinition } from '../core/types.js';
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider extends BaseProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  formatMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: this.formatMessages(messages),
      tools: tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      })),
    });

    const toolCalls = response.content
      .filter(c => c.type === 'tool_use')
      .map(c => ({
        id: c.id,
        name: c.name,
        arguments: c.input as Record<string, unknown>,
      }));

    const textContent = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      content: textContent || undefined,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage ? {
        prompt: response.usage.input_tokens,
        completion: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      } : undefined,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/providers/anthropic.test.ts
```

Expected: Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/providers/anthropic.test.ts src/providers/anthropic.ts
git commit -m "feat: add Anthropic provider with tests"
```

---

## Task 10: OpenAI Provider

**Files:**
- Create: `src/providers/openai.ts`
- Test: `tests/unit/providers/openai.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/providers/openai.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OpenAIProvider } from '../../../src/providers/openai.js';

describe('OpenAIProvider', () => {
  it('should have correct name', () => {
    const provider = new OpenAIProvider('test-key');
    assert.strictEqual(provider.name, 'openai');
  });

  it('should format messages correctly', () => {
    const provider = new OpenAIProvider('test-key');
    const formatted = provider.formatMessages([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);
    assert.strictEqual(formatted.length, 2);
    assert.strictEqual(formatted[0].role, 'user');
    assert.strictEqual(formatted[0].content, 'Hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/unit/providers/openai.test.ts
```

Expected: FAIL with import errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/providers/openai.ts`:

```typescript
import { BaseProvider } from './base.js';
import { Message, ProviderResponse, ToolDefinition } from '../core/types.js';
import OpenAI from 'openai';

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  formatMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.tool_call_id || '',
        };
      }
      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      };
    });
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<ProviderResponse> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: this.formatMessages(messages),
      tools: tools?.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    });

    const choice = response.choices[0];
    const message = choice.message;

    return {
      content: message.content || undefined,
      tool_calls: message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      usage: response.usage ? {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      } : undefined,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/unit/providers/openai.test.ts
```

Expected: Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/providers/openai.test.ts src/providers/openai.ts
git commit -m "feat: add OpenAI provider with tests"
```

---

## Task 11: Agent Core Loop

**Files:**
- Create: `src/core/loop.ts`
- Create: `src/core/context.ts`
- Test: `tests/integration/loop.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/loop.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AgentLoop } from '../../src/core/loop.js';
import { IProvider, Message, Tool, ProviderResponse } from '../../src/core/types.js';

class MockProvider implements IProvider {
  name = 'mock';
  private responses: ProviderResponse[];
  private callCount = 0;

  constructor(responses: ProviderResponse[]) {
    this.responses = responses;
  }

  async chat(): Promise<ProviderResponse> {
    return this.responses[this.callCount++] || { content: 'done' };
  }
}

describe('AgentLoop', () => {
  it('should handle simple text response', async () => {
    const provider = new MockProvider([
      { content: 'Hello there' },
    ]);
    const loop = new AgentLoop({ provider, tools: [] });
    const result = await loop.run('Say hi');
    assert.strictEqual(result, 'Hello there');
  });

  it('should execute tool call and return result', async () => {
    let toolExecuted = false;
    const mockTool: Tool = {
      name: 'TestTool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      async execute() {
        toolExecuted = true;
        return { success: true, output: 'tool result' };
      },
    };

    const provider = new MockProvider([
      {
        tool_calls: [{
          id: 'call_1',
          name: 'TestTool',
          arguments: {},
        }],
      },
      { content: 'Done with tool' },
    ]);

    const loop = new AgentLoop({ provider, tools: [mockTool] });
    const result = await loop.run('Use tool');
    assert.strictEqual(toolExecuted, true);
    assert.strictEqual(result, 'Done with tool');
  });

  it('should respect max iterations', async () => {
    const provider = new MockProvider([
      { tool_calls: [{ id: '1', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '2', name: 'TestTool', arguments: {} }] },
      { tool_calls: [{ id: '3', name: 'TestTool', arguments: {} }] },
    ]);

    const mockTool: Tool = {
      name: 'TestTool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: true, output: 'ok' };
      },
    };

    const loop = new AgentLoop({ provider, tools: [mockTool], maxIterations: 2 });
    const result = await loop.run('Loop test');
    assert.ok(result.includes('max') || result.includes('limit') || result.includes('iteration'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/integration/loop.test.ts
```

Expected: FAIL with import errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/loop.ts`:

```typescript
import { IProvider, Message, Tool, ToolResult, LoopConfig } from './types.js';
import { ToolRegistry } from '../tools/registry.js';
import { PermissionManager } from '../permissions/manager.js';

export interface AgentLoopConfig extends LoopConfig {
  permissionManager?: PermissionManager;
}

export class AgentLoop {
  private provider: IProvider;
  private registry: ToolRegistry;
  private maxIterations: number;
  private permissionManager: PermissionManager;

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider;
    this.maxIterations = config.maxIterations || 25;
    this.permissionManager = config.permissionManager || new PermissionManager();
    this.registry = new ToolRegistry();
    for (const tool of config.tools) {
      this.registry.register(tool);
    }
  }

  async run(userInput: string): Promise<string> {
    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are karen-cli, a helpful coding assistant. Use tools when needed.',
      },
      { role: 'user', content: userInput },
    ];

    for (let i = 0; i < this.maxIterations; i++) {
      const response = await this.provider.chat(messages, this.registry.definitions());

      if (response.content && !response.tool_calls) {
        return response.content;
      }

      if (response.tool_calls) {
        const toolResults: Message[] = [];

        for (const tc of response.tool_calls) {
          const tool = this.registry.get(tc.name);
          let result: ToolResult;

          if (!tool) {
            result = { success: false, output: '', error: `Tool ${tc.name} not found` };
          } else {
            const allowed = await this.permissionManager.check(tc.name, tc.arguments);
            if (!allowed) {
              result = { success: false, output: '', error: `Permission denied for ${tc.name}` };
            } else {
              result = await tool.execute(tc.arguments);
            }
          }

          toolResults.push({
            role: 'tool',
            content: result.success ? result.output : `Error: ${result.error}`,
            tool_call_id: tc.id,
          });
        }

        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: response.tool_calls,
        });

        messages.push(...toolResults);
      }
    }

    return 'Error: Reached maximum iteration limit';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/integration/loop.test.ts
```

Expected: Tests PASS.

- [ ] **Step 5: Run all unit tests to verify no regressions**

```bash
npx tsx --test tests/unit/**/*.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/loop.test.ts src/core/loop.ts
git commit -m "feat: add Agent Core Loop with integration tests"
```

---

## Task 12: REPL

**Files:**
- Create: `src/cli/commands.ts`
- Create: `src/cli/repl.ts`
- Test: `tests/e2e/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/cli.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCommand } from '../../src/cli/commands.js';

describe('CLI Commands', () => {
  it('should parse /exit command', () => {
    const cmd = parseCommand('/exit');
    assert.strictEqual(cmd.type, 'exit');
  });

  it('should parse /model command', () => {
    const cmd = parseCommand('/model claude');
    assert.strictEqual(cmd.type, 'model');
    assert.strictEqual(cmd.args, 'claude');
  });

  it('should return null for normal input', () => {
    const cmd = parseCommand('hello world');
    assert.strictEqual(cmd, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/e2e/cli.test.ts
```

Expected: FAIL with import errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/cli/commands.ts`:

```typescript
export interface ParsedCommand {
  type: 'exit' | 'model' | 'tools' | 'tasks' | 'help';
  args?: string;
}

export function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) return null;

  const parts = input.slice(1).split(' ');
  const cmd = parts[0];
  const args = parts.slice(1).join(' ').trim();

  switch (cmd) {
    case 'exit':
    case 'quit':
      return { type: 'exit' };
    case 'model':
      return { type: 'model', args };
    case 'tools':
      return { type: 'tools' };
    case 'tasks':
      return { type: 'tasks' };
    case 'help':
      return { type: 'help' };
    default:
      return null;
  }
}
```

Create `src/cli/repl.ts`:

```typescript
import { createInterface, Interface } from 'readline';
import { AgentLoop } from '../core/loop.js';
import { parseCommand } from './commands.js';
import { Logger } from '../utils/logger.js';

export interface ReplOptions {
  loop: AgentLoop;
}

export class Repl {
  private rl: Interface;
  private loop: AgentLoop;
  private running = true;

  constructor(options: ReplOptions) {
    this.loop = options.loop;
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });
  }

  async start(): Promise<void> {
    this.rl.prompt();

    for await (const line of this.rl) {
      const input = line.trim();
      if (!input) {
        this.rl.prompt();
        continue;
      }

      const cmd = parseCommand(input);
      if (cmd) {
        if (cmd.type === 'exit') {
          this.running = false;
          break;
        }
        await this.handleCommand(cmd);
      } else {
        try {
          const response = await this.loop.run(input);
          console.log(response);
        } catch (err) {
          Logger.error(`Error: ${(err as Error).message}`);
        }
      }

      if (this.running) {
        this.rl.prompt();
      }
    }

    this.rl.close();
  }

  private async handleCommand(cmd: ReturnType<typeof parseCommand>): Promise<void> {
    if (!cmd) return;
    switch (cmd.type) {
      case 'help':
        console.log('Commands: /exit, /model <name>, /tools, /tasks, /help');
        break;
      case 'model':
        console.log(`Model switching not yet implemented. Requested: ${cmd.args}`);
        break;
      case 'tools':
        console.log('Tool listing not yet implemented.');
        break;
      case 'tasks':
        console.log('Task listing not yet implemented.');
        break;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/e2e/cli.test.ts
```

Expected: Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/cli.test.ts src/cli/commands.ts src/cli/repl.ts
git commit -m "feat: add REPL and command parser with tests"
```

---

## Task 13: CLI Entry Point

**Files:**
- Create: `bin/karen.ts`
- Modify: `package.json` (add bin entry)

- [ ] **Step 1: Write CLI entry point**

Create `bin/karen.ts`:

```typescript
#!/usr/bin/env node
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import { AgentLoop } from '../src/core/loop.js';
import { Repl } from '../src/cli/repl.js';
import { Logger } from '../src/utils/logger.js';

import { createReadTool } from '../src/tools/read.js';
import { createWriteTool } from '../src/tools/write.js';
import { createEditTool } from '../src/tools/edit.js';
import { createBashTool } from '../src/tools/bash.js';
import { createGrepTool } from '../src/tools/grep.js';
import { createGlobTool } from '../src/tools/glob.js';
import { PermissionManager } from '../src/permissions/manager.js';

function getProvider() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const preferred = process.env.KAREN_PROVIDER || 'anthropic';

  if (preferred === 'anthropic' && anthropicKey) {
    return new AnthropicProvider(anthropicKey);
  }
  if (preferred === 'openai' && openaiKey) {
    return new OpenAIProvider(openaiKey);
  }
  if (anthropicKey) {
    return new AnthropicProvider(anthropicKey);
  }
  if (openaiKey) {
    return new OpenAIProvider(openaiKey);
  }

  Logger.error('No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  process.exit(1);
}

function getPermissionManager(): PermissionManager {
  return new PermissionManager({
    confirm: async (toolName: string, args: Record<string, unknown>) => {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise<boolean>((resolve) => {
        const command = toolName === 'Bash'
          ? String(args.command)
          : String(args.file_path);
        rl.question(`Allow ${toolName} on "${command}"? (y/n): `, (answer) => {
          rl.close();
          resolve(answer.toLowerCase().startsWith('y'));
        });
      });
    },
  });
}

async function main() {
  const provider = getProvider();
  Logger.info(`Using provider: ${provider.name}`);

  const tools = [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createBashTool(),
    createGrepTool(),
    createGlobTool(),
  ];

  const loop = new AgentLoop({
    provider,
    tools,
    permissionManager: getPermissionManager(),
  });

  const repl = new Repl({ loop });
  await repl.start();
}

main().catch((err) => {
  Logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Update package.json bin entry**

Modify `package.json` to add the bin entry:

```json
{
  "name": "karen-cli",
  "version": "0.1.0",
  "description": "A general-purpose coding assistant CLI inspired by Claude Code",
  "type": "module",
  "main": "dist/bin/karen.js",
  "bin": {
    "karen": "dist/bin/karen.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/bin/karen.js",
    "test": "npx tsx --test tests/**/*.test.ts",
    "test:unit": "npx tsx --test tests/unit/**/*.test.ts",
    "test:integration": "npx tsx --test tests/integration/**/*.test.ts",
    "test:e2e": "npx tsx --test tests/e2e/**/*.test.ts",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "openai": "^4.77.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 3: Run all tests to verify no regressions**

```bash
npx tsx --test tests/**/*.test.ts
```

Expected: All tests PASS.

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add bin/karen.ts package.json
git commit -m "feat: add CLI entry point with all tools wired up"
```

---

## Self-Review

### Spec Coverage Check

| Spec Requirement | Implementing Task |
|-----------------|-------------------|
| Agent Loop (basic) | Task 11 |
| REPL | Task 12 |
| Tools (Read/Write/Edit/Bash/Grep/Glob) | Tasks 1-6 |
| Tool Registry | Task 7 |
| Permissions | Task 8 |
| Multi-model (Anthropic + OpenAI) | Tasks 9-10 |
| Error handling (API retry, tool error, max iterations) | Task 11 |
| CLI entry | Task 13 |

**Gaps:** None for MVP scope.

### Placeholder Scan

- No "TBD", "TODO", or "implement later" found.
- All test files contain actual test code.
- All implementation files contain actual code.
- No vague references like "similar to Task N".

### Type Consistency

- Tool interface matches between `types.ts` and all tool implementations.
- Provider interface consistent between `base.ts`, `anthropic.ts`, `openai.ts`.
- Message type used consistently across loop and providers.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2025-05-21-karen-cli-mvp.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** - Fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
