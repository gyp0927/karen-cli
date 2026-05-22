import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TaskManager } from '../../../src/tasks/manager.js';

describe('TaskManager', () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  it('should create a task', () => {
    const task = manager.create({ title: 'Write tests', description: 'Add unit tests' });
    assert.strictEqual(task.title, 'Write tests');
    assert.strictEqual(task.status, 'pending');
    assert.ok(task.id);
    assert.ok(task.createdAt);
  });

  it('should list all tasks', () => {
    manager.create({ title: 'A' });
    manager.create({ title: 'B' });
    const tasks = manager.list();
    assert.strictEqual(tasks.length, 2);
  });

  it('should start a task', () => {
    const task = manager.create({ title: 'Start me' });
    const started = manager.start(task.id);
    assert.ok(started);
    assert.strictEqual(started!.status, 'running');
  });

  it('should complete a task', () => {
    const task = manager.create({ title: 'Complete me' });
    manager.start(task.id);
    const completed = manager.complete(task.id, 'Done!');
    assert.ok(completed);
    assert.strictEqual(completed!.status, 'completed');
    assert.strictEqual(completed!.result, 'Done!');
  });

  it('should fail a task', () => {
    const task = manager.create({ title: 'Fail me' });
    manager.start(task.id);
    const failed = manager.fail(task.id, 'Something broke');
    assert.ok(failed);
    assert.strictEqual(failed!.status, 'failed');
    assert.strictEqual(failed!.error, 'Something broke');
  });

  it('should get tasks by status', () => {
    const t1 = manager.create({ title: 'Pending' });
    const t2 = manager.create({ title: 'Running' });
    manager.start(t2.id);

    assert.strictEqual(manager.getByStatus('pending').length, 1);
    assert.strictEqual(manager.getByStatus('running').length, 1);
  });

  it('should support task dependencies', () => {
    const parent = manager.create({ title: 'Parent' });
    const child = manager.create({ title: 'Child', dependencies: [parent.id] });

    assert.deepStrictEqual(child.dependencies, [parent.id]);
    const ready = manager.getReadyTasks();
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].id, parent.id);
  });

  it('should not start a task with incomplete dependencies', () => {
    const parent = manager.create({ title: 'Parent' });
    const child = manager.create({ title: 'Child', dependencies: [parent.id] });

    const started = manager.start(child.id);
    assert.strictEqual(started, null);
  });

  it('should allow starting a task when dependencies are completed', () => {
    const parent = manager.create({ title: 'Parent' });
    const child = manager.create({ title: 'Child', dependencies: [parent.id] });

    manager.start(parent.id);
    manager.complete(parent.id);

    const started = manager.start(child.id);
    assert.ok(started);
    assert.strictEqual(started!.status, 'running');
  });

  it('should return blocked tasks', () => {
    const parent = manager.create({ title: 'Parent' });
    manager.create({ title: 'Child', dependencies: [parent.id] });

    const blocked = manager.getBlockedTasks();
    assert.strictEqual(blocked.length, 1);
    assert.strictEqual(blocked[0].title, 'Child');
  });

  it('should return null for non-existent task operations', () => {
    assert.strictEqual(manager.start('non-existent'), null);
    assert.strictEqual(manager.complete('non-existent'), null);
    assert.strictEqual(manager.fail('non-existent'), null);
    assert.strictEqual(manager.getById('non-existent'), null);
  });

  it('should get task graph summary', () => {
    manager.create({ title: 'A' });
    manager.create({ title: 'B' });
    const summary = manager.getSummary();
    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.pending, 2);
  });
});
