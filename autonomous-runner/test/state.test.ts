import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInitialState, makeTaskId, StateStore } from '../src/state.js';

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-runner-state-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('createInitialState', () => {
  it('starts in PLANNING with zeroed counters', () => {
    const state = createInitialState('t1', 'PLAN.md', '/repo', 5);
    expect(state.status).toBe('PLANNING');
    expect(state.iteration).toBe(0);
    expect(state.maxIterations).toBe(5);
    expect(state.toolCalls).toBe(0);
    expect(state.modelCalls).toBe(0);
    expect(state.buildAttempts).toBe(0);
    expect(state.testAttempts).toBe(0);
    expect(state.filesChanged).toEqual([]);
    expect(state.errors).toEqual([]);
    expect(state.completedAt).toBeUndefined();
  });
});

describe('makeTaskId', () => {
  it('derives a stable-looking id from the task file basename', () => {
    const id = makeTaskId('/some/path/PLAN.md');
    expect(id.startsWith('PLAN-')).toBe(true);
  });
});

describe('StateStore', () => {
  it('persists state as JSON and round-trips it', () => {
    const dir = mkTmp();
    const store = new StateStore(dir, 'task-1');
    const state = createInitialState('task-1', 'PLAN.md', '/repo', 3);
    store.save(state);

    expect(fs.existsSync(store.path)).toBe(true);
    const roundTripped = JSON.parse(fs.readFileSync(store.path, 'utf8'));
    expect(roundTripped.taskId).toBe('task-1');
    expect(roundTripped.maxIterations).toBe(3);
  });

  it('creates the state directory if missing', () => {
    const dir = path.join(mkTmp(), 'nested', 'state');
    const store = new StateStore(dir, 'task-2');
    store.save(createInitialState('task-2', 'PLAN.md', '/repo', 3));
    expect(fs.existsSync(store.path)).toBe(true);
  });
});
