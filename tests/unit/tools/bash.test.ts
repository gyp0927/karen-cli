import assert from 'node:assert';
import { test, describe } from 'node:test';
import { createBashTool, ProcessManager } from '../../../src/tools/bash.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Bash tool', () => {
  test('executes echo hello and output contains hello', async () => {
    const pm = new ProcessManager();
    const tool = createBashTool(pm);
    const result = await tool.execute({ command: 'echo hello' });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('hello'));
  });

  test('fails for invalid command', async () => {
    const pm = new ProcessManager();
    const tool = createBashTool(pm);
    const result = await tool.execute({ command: 'this_command_does_not_exist_12345' });
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  test('executes command in specified cwd', async () => {
    const pm = new ProcessManager();
    const testDir = join(tmpdir(), 'karen-test-cwd');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'test.txt'), 'hello from cwd', 'utf8');

    const tool = createBashTool(pm);
    const result = await tool.execute({
      command: process.platform === 'win32' ? 'type test.txt' : 'cat test.txt',
      cwd: testDir
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('hello from cwd'));

    rmSync(testDir, { recursive: true, force: true });
  });

  test('supports background processes', async () => {
    const pm = new ProcessManager();
    const tool = createBashTool(pm);
    const result = await tool.execute({
      command: process.platform === 'win32' ? 'timeout /t 2' : 'sleep 2',
      background: true
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('Started background process'));

    // Extract process ID
    const match = result.output.match(/proc_\d+/);
    assert.ok(match, 'Should return a process ID');

    // Clean up
    if (match) {
      await tool.execute({
        command: '',
        process_id: match[0],
        action: 'kill'
      });
    }
  });

  test('process manager is isolated per instance', async () => {
    const pm1 = new ProcessManager();
    const pm2 = new ProcessManager();

    const tool1 = createBashTool(pm1);
    const tool2 = createBashTool(pm2);

    // Start background process in pm1
    const result1 = await tool1.execute({
      command: process.platform === 'win32' ? 'timeout /t 10' : 'sleep 10',
      background: true
    });

    assert.strictEqual(pm1.getProcessCount(), 1);
    assert.strictEqual(pm2.getProcessCount(), 0);

    // Clean up
    const match = result1.output.match(/proc_\d+/);
    if (match) {
      await tool1.execute({ command: '', process_id: match[0], action: 'kill' });
    }
  });
});
