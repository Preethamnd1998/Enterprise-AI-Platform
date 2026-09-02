import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deriveResumePoint, validateResumeMatch, findResumableStates, isTerminal } from '../src/resume.js';
import { createInitialState, hashTaskContent } from '../src/state.js';
import type { LoopState } from '../src/types.js';

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-runner-resume-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeState(overrides: Partial<LoopState> = {}): LoopState {
  const base = createInitialState('t1', '/repo/TASK.md', '/repo', 5, hashTaskContent('# task'));
  return { ...base, ...overrides };
}

describe('isTerminal', () => {
  it('treats SUCCESS/FAILED/MAX_ITERATIONS as terminal', () => {
    expect(isTerminal(makeState({ status: 'SUCCESS' }))).toBe(true);
    expect(isTerminal(makeState({ status: 'FAILED' }))).toBe(true);
    expect(isTerminal(makeState({ status: 'MAX_ITERATIONS' }))).toBe(true);
  });

  it('treats PLANNING/RUNNING/VALIDATING as non-terminal', () => {
    expect(isTerminal(makeState({ status: 'PLANNING' }))).toBe(false);
    expect(isTerminal(makeState({ status: 'RUNNING' }))).toBe(false);
    expect(isTerminal(makeState({ status: 'VALIDATING' }))).toBe(false);
  });
});

describe('deriveResumePoint', () => {
  it('returns undefined when nothing was safely completed (checkpoint.phase null)', () => {
    const state = makeState({ checkpoint: { phase: null, iteration: 0, savedAt: 'x' } });
    expect(deriveResumePoint(state)).toBeUndefined();
  });

  it('returns undefined when checkpoint is past analyze_plan but no plan was persisted (defensive)', () => {
    const state = makeState({ checkpoint: { phase: 'execute', iteration: 1, savedAt: 'x' }, plan: undefined });
    expect(deriveResumePoint(state)).toBeUndefined();
  });

  it('resumes at Execute (iteration 1) after analyze_plan completed', () => {
    const state = makeState({ checkpoint: { phase: 'analyze_plan', iteration: 0, savedAt: 'x' }, plan: 'the plan' });
    expect(deriveResumePoint(state)).toEqual({ plan: 'the plan', startIteration: 1, startPhase: 'execute', previousErrors: [] });
  });

  it('resumes at Validate (same iteration) after execute completed', () => {
    const state = makeState({
      checkpoint: { phase: 'execute', iteration: 2, savedAt: 'x' },
      plan: 'the plan',
      lastValidationErrors: ['prior error'],
    });
    expect(deriveResumePoint(state)).toEqual({ plan: 'the plan', startIteration: 2, startPhase: 'validate', previousErrors: ['prior error'] });
  });

  it('resumes at Validate (same iteration) after fix completed', () => {
    const state = makeState({ checkpoint: { phase: 'fix', iteration: 3, savedAt: 'x' }, plan: 'the plan' });
    expect(deriveResumePoint(state)).toEqual({ plan: 'the plan', startIteration: 3, startPhase: 'validate', previousErrors: [] });
  });

  it('resumes at Fix (next iteration) after validate completed', () => {
    const state = makeState({
      checkpoint: { phase: 'validate', iteration: 2, savedAt: 'x' },
      plan: 'the plan',
      lastValidationErrors: ['build failed'],
    });
    expect(deriveResumePoint(state)).toEqual({ plan: 'the plan', startIteration: 3, startPhase: 'fix', previousErrors: ['build failed'] });
  });
});

describe('validateResumeMatch', () => {
  const hash = hashTaskContent('# task v1');

  it('rejects a terminal (already-completed) task', () => {
    const state = makeState({ status: 'SUCCESS', repoPath: '/repo', task: '/repo/TASK.md', taskContentHash: hash });
    const result = validateResumeMatch(state, '/repo', '/repo/TASK.md', hash);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already completed/);
  });

  it('rejects a repository mismatch', () => {
    const state = makeState({ status: 'RUNNING', repoPath: '/other-repo', task: '/repo/TASK.md', taskContentHash: hash });
    const result = validateResumeMatch(state, '/repo', '/repo/TASK.md', hash);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/different repository/);
  });

  it('rejects a task file mismatch', () => {
    const state = makeState({ status: 'RUNNING', repoPath: '/repo', task: '/repo/OTHER.md', taskContentHash: hash });
    const result = validateResumeMatch(state, '/repo', '/repo/TASK.md', hash);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/different task file/);
  });

  it('rejects a task content hash mismatch', () => {
    const state = makeState({ status: 'RUNNING', repoPath: '/repo', task: '/repo/TASK.md', taskContentHash: hash });
    const result = validateResumeMatch(state, '/repo', '/repo/TASK.md', hashTaskContent('# task v2 — edited'));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/content has changed/);
  });

  it('allows a legacy state with no recorded hash through the content check', () => {
    const state = makeState({ status: 'RUNNING', repoPath: '/repo', task: '/repo/TASK.md', taskContentHash: '' });
    const result = validateResumeMatch(state, '/repo', '/repo/TASK.md', hashTaskContent('# whatever now'));
    expect(result.ok).toBe(true);
  });

  it('accepts a matching, non-terminal state', () => {
    const state = makeState({ status: 'RUNNING', repoPath: '/repo', task: '/repo/TASK.md', taskContentHash: hash });
    expect(validateResumeMatch(state, '/repo', '/repo/TASK.md', hash)).toEqual({ ok: true });
  });
});

describe('findResumableStates', () => {
  it('returns only non-terminal states matching repo+task, most recent first', () => {
    const dir = mkTmp();
    const repo = '/repo';
    const task = '/repo/TASK.md';
    const hash = hashTaskContent('# task');

    const older = makeState({ taskId: 'older', status: 'RUNNING', repoPath: repo, task, taskContentHash: hash, startedAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeState({ taskId: 'newer', status: 'VALIDATING', repoPath: repo, task, taskContentHash: hash, startedAt: '2026-01-02T00:00:00.000Z' });
    const terminal = makeState({ taskId: 'done', status: 'SUCCESS', repoPath: repo, task, taskContentHash: hash, startedAt: '2026-01-03T00:00:00.000Z' });
    const otherRepo = makeState({ taskId: 'other-repo', status: 'RUNNING', repoPath: '/elsewhere', task, taskContentHash: hash });
    const otherTask = makeState({ taskId: 'other-task', status: 'RUNNING', repoPath: repo, task: '/repo/OTHER.md', taskContentHash: hash });

    for (const s of [older, newer, terminal, otherRepo, otherTask]) {
      fs.writeFileSync(path.join(dir, `${s.taskId}.state.json`), JSON.stringify(s));
    }

    const results = findResumableStates(dir, repo, task);
    expect(results.map((r) => r.taskId)).toEqual(['newer', 'older']);
  });

  it('returns an empty list when the state directory does not exist', () => {
    expect(findResumableStates(path.join(mkTmp(), 'nope'), '/repo', '/repo/TASK.md')).toEqual([]);
  });

  it('ignores corrupt state files instead of throwing', () => {
    const dir = mkTmp();
    fs.writeFileSync(path.join(dir, 'corrupt.state.json'), '{not valid json');
    expect(() => findResumableStates(dir, '/repo', '/repo/TASK.md')).not.toThrow();
    expect(findResumableStates(dir, '/repo', '/repo/TASK.md')).toEqual([]);
  });
});
