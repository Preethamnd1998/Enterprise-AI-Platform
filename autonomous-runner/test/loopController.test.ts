import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLoop, type LoopDeps } from '../src/loopController.js';
import { createInitialState } from '../src/state.js';
import { AuditLog } from '../src/audit.js';
import { StateStore } from '../src/state.js';
import type { RunnerConfig, ValidationResult, LoopState } from '../src/types.js';

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-runner-loop-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeConfig(overrides: Partial<RunnerConfig> = {}): RunnerConfig {
  return {
    repoPath: '/fake/repo',
    taskFile: '/fake/repo/TASK.md',
    maxIterations: 3,
    maxToolCallsPerPhase: 40,
    maxBuildAttempts: 3,
    maxTestAttempts: 3,
    timeoutMs: 60_000,
    model: 'claude-opus-5',
    fallbackModel: 'claude-sonnet-5',
    yes: true,
    allowDirty: true,
    verbose: false,
    platformRoot: '/fake/platform',
    agentLimit: 1,
    ...overrides,
  };
}

function makeDeps(dir: string, overrides: Partial<LoopDeps> = {}): LoopDeps {
  return {
    analyzeAndPlan: async () => ({ plan: 'plan text', costUsd: 0.01, toolCalls: 2, subagentInvocations: 0 }),
    execute: async () => ({ costUsd: 0.02, toolCalls: 3, isError: false, errors: [], subagentInvocations: 0 }),
    validate: async () => ({ pass: true, errors: [] }) as ValidationResult,
    audit: new AuditLog(path.join(dir, 'audit'), 'test-task'),
    stateStore: new StateStore(path.join(dir, 'state'), 'test-task'),
    getChangedFiles: () => ['src/foo.ts'],
    ...overrides,
  };
}

describe('runLoop', () => {
  it('reaches SUCCESS on the first iteration when the validator passes immediately', async () => {
    const dir = mkTmp();
    const config = makeConfig();
    const initial = createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations);
    const deps = makeDeps(dir);

    const { state } = await runLoop(config, '# task', initial, deps);

    expect(state.status).toBe('SUCCESS');
    expect(state.iteration).toBe(1);
    expect(state.modelCalls).toBe(2); // 1 analyze/plan + 1 execute
    expect(state.filesChanged).toEqual(['src/foo.ts']);
    expect(state.completedAt).toBeDefined();
  });

  it('retries through the Fix phase and eventually reaches SUCCESS', async () => {
    const dir = mkTmp();
    const config = makeConfig({ maxIterations: 5 });
    const initial = createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations);

    let calls = 0;
    const deps = makeDeps(dir, {
      validate: async () => {
        calls += 1;
        if (calls < 3) return { pass: false, errors: [`attempt ${calls} failed`] };
        return { pass: true, errors: [] };
      },
    });

    const { state } = await runLoop(config, '# task', initial, deps);

    expect(state.status).toBe('SUCCESS');
    expect(state.iteration).toBe(3);
  });

  it('stops at MAX_ITERATIONS when the validator never passes and no attempt ceiling is hit', async () => {
    const dir = mkTmp();
    const config = makeConfig({ maxIterations: 3 });
    const initial = createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations);

    const deps = makeDeps(dir, {
      // No build/test ran (ran: false) so the attempt-ceiling short-circuit never fires —
      // this exercises the pure iteration-count bound.
      validate: async () => ({ pass: false, errors: ['still broken'] }),
    });

    const { state } = await runLoop(config, '# task', initial, deps);

    expect(state.status).toBe('MAX_ITERATIONS');
    expect(state.iteration).toBe(3);
    expect(state.errors.length).toBeGreaterThan(0);
  });

  it('stops at FAILED once maxBuildAttempts is reached, before maxIterations', async () => {
    const dir = mkTmp();
    const config = makeConfig({ maxIterations: 10, maxBuildAttempts: 2 });
    const initial = createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations);

    const deps = makeDeps(dir, {
      validate: async () => ({
        pass: false,
        build: { ran: true, pass: false, summary: 'compile error' },
        errors: ['build failed'],
      }),
    });

    const { state } = await runLoop(config, '# task', initial, deps);

    expect(state.status).toBe('FAILED');
    expect(state.buildAttempts).toBe(2);
    expect(state.iteration).toBe(2); // stopped at the 2nd iteration, well short of the 10-iteration cap
  });

  it('never exceeds maxIterations even if every dependency keeps failing', async () => {
    const dir = mkTmp();
    const config = makeConfig({ maxIterations: 4 });
    const initial = createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations);
    let executeCalls = 0;

    const deps = makeDeps(dir, {
      execute: async () => {
        executeCalls += 1;
        return { costUsd: 0, toolCalls: 0, isError: true, errors: ['tool failure'], subagentInvocations: 0 };
      },
      validate: async () => ({ pass: false, errors: ['still broken'] }),
    });

    const { state } = await runLoop(config, '# task', initial, deps);

    expect(state.status).toBe('MAX_ITERATIONS');
    expect(executeCalls).toBe(4);
    expect(state.iteration).toBe(4);
  });

  it('persists state to disk after every transition', async () => {
    const dir = mkTmp();
    const config = makeConfig();
    const initial = createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations);
    const stateStore = new StateStore(path.join(dir, 'state'), 'test-task');
    const deps = makeDeps(dir, { stateStore });

    await runLoop(config, '# task', initial, deps);

    const persisted = JSON.parse(fs.readFileSync(stateStore.path, 'utf8'));
    expect(persisted.status).toBe('SUCCESS');
  });

  it('writes a checkpoint after analyze_plan, execute, and validate', async () => {
    const dir = mkTmp();
    const config = makeConfig();
    const initial = createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations);
    const checkpoints: string[] = [];
    const stateStore = new StateStore(path.join(dir, 'state'), 'test-task');
    const originalSave = stateStore.save.bind(stateStore);
    stateStore.save = (s) => {
      checkpoints.push(`${s.checkpoint.phase ?? 'none'}@${s.checkpoint.iteration}`);
      originalSave(s);
    };
    const deps = makeDeps(dir, { stateStore });

    await runLoop(config, '# task', initial, deps);

    expect(checkpoints).toContain('analyze_plan@0');
    expect(checkpoints).toContain('execute@1');
    expect(checkpoints).toContain('validate@1');
  });
});

describe('runLoop — resume', () => {
  it('resuming from an analyze_plan checkpoint skips re-planning and starts at Execute', async () => {
    const dir = mkTmp();
    const config = makeConfig();
    let analyzeCalls = 0;
    const initial: LoopState = {
      ...createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations),
      status: 'PLANNING',
      checkpoint: { phase: 'analyze_plan', iteration: 0, savedAt: 'x' },
      plan: 'persisted plan',
    };
    const deps = makeDeps(dir, {
      analyzeAndPlan: async () => {
        analyzeCalls += 1;
        return { plan: 'should not be used', costUsd: 0, toolCalls: 0, subagentInvocations: 0 };
      },
    });

    const { state } = await runLoop(config, '# task', initial, deps, { point: { plan: 'persisted plan', startIteration: 1, startPhase: 'execute', previousErrors: [] } });

    expect(analyzeCalls).toBe(0);
    expect(state.status).toBe('SUCCESS');
    expect(state.iteration).toBe(1);
  });

  it('resuming from an execute checkpoint skips re-executing and goes straight to Validate', async () => {
    const dir = mkTmp();
    const config = makeConfig();
    let executeCalls = 0;
    const initial: LoopState = {
      ...createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations),
      status: 'RUNNING',
      iteration: 2,
      checkpoint: { phase: 'execute', iteration: 2, savedAt: 'x' },
      plan: 'persisted plan',
    };
    const deps = makeDeps(dir, {
      execute: async () => {
        executeCalls += 1;
        return { costUsd: 0, toolCalls: 0, isError: false, errors: [], subagentInvocations: 0 };
      },
    });

    const { state } = await runLoop(config, '# task', initial, deps, { point: { plan: 'persisted plan', startIteration: 2, startPhase: 'validate', previousErrors: [] } });

    expect(executeCalls).toBe(0);
    expect(state.status).toBe('SUCCESS');
    expect(state.iteration).toBe(2); // did not restart from iteration 1
  });

  it('resuming from a validate checkpoint continues at Fix for the next iteration', async () => {
    const dir = mkTmp();
    const config = makeConfig({ maxIterations: 5 });
    const initial: LoopState = {
      ...createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations),
      status: 'VALIDATING',
      iteration: 1,
      checkpoint: { phase: 'validate', iteration: 1, savedAt: 'x' },
      plan: 'persisted plan',
      lastValidationErrors: ['build failed'],
    };
    let receivedPreviousErrors: string[] = [];
    const deps = makeDeps(dir, {
      execute: async (_task, _plan, state, previousErrors) => {
        receivedPreviousErrors = previousErrors;
        return { costUsd: 0, toolCalls: 1, isError: false, errors: [], subagentInvocations: 0 };
      },
    });

    const { state } = await runLoop(config, '# task', initial, deps, {
      point: { plan: 'persisted plan', startIteration: 2, startPhase: 'fix', previousErrors: ['build failed'] },
    });

    expect(receivedPreviousErrors).toEqual(['build failed']);
    expect(state.status).toBe('SUCCESS');
    expect(state.iteration).toBe(2);
  });

  it('resuming with no safe checkpoint (point undefined) re-runs analyze_plan under the same taskId', async () => {
    const dir = mkTmp();
    const config = makeConfig();
    let analyzeCalls = 0;
    const initial: LoopState = {
      ...createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations),
      status: 'PLANNING',
      checkpoint: { phase: null, iteration: 0, savedAt: 'x' },
    };
    const deps = makeDeps(dir, {
      analyzeAndPlan: async () => {
        analyzeCalls += 1;
        return { plan: 'fresh plan', costUsd: 0, toolCalls: 0, subagentInvocations: 0 };
      },
    });

    const { state } = await runLoop(config, '# task', initial, deps, {});

    expect(analyzeCalls).toBe(1);
    expect(state.status).toBe('SUCCESS');
    expect(state.taskId).toBe('test-task');
  });

  it('never exceeds maxIterations when resuming mid-way through a permanently failing run', async () => {
    const dir = mkTmp();
    const config = makeConfig({ maxIterations: 4 });
    const initial: LoopState = {
      ...createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations),
      status: 'VALIDATING',
      iteration: 2,
      checkpoint: { phase: 'validate', iteration: 2, savedAt: 'x' },
      plan: 'persisted plan',
    };
    const deps = makeDeps(dir, { validate: async () => ({ pass: false, errors: ['still broken'] }) });

    const { state } = await runLoop(config, '# task', initial, deps, {
      point: { plan: 'persisted plan', startIteration: 3, startPhase: 'fix', previousErrors: [] },
    });

    expect(state.status).toBe('MAX_ITERATIONS');
    expect(state.iteration).toBe(4);
  });

  it('writes a loop_resume audit event carrying the resume point, instead of loop_start', async () => {
    const dir = mkTmp();
    const config = makeConfig();
    const audit = new AuditLog(path.join(dir, 'audit'), 'test-task');
    const initial: LoopState = {
      ...createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations),
      status: 'RUNNING',
      iteration: 1,
      checkpoint: { phase: 'execute', iteration: 1, savedAt: 'x' },
      plan: 'persisted plan',
    };
    const deps = makeDeps(dir, { audit });

    await runLoop(config, '# task', initial, deps, { point: { plan: 'persisted plan', startIteration: 1, startPhase: 'validate', previousErrors: [] } });

    const lines = fs.readFileSync(audit.path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const events = lines.map((l) => l.event);
    expect(events).toContain('loop_resume');
    expect(events).not.toContain('loop_start');
    const resumeEvent = lines.find((l) => l.event === 'loop_resume');
    expect(resumeEvent.startPhase).toBe('validate');
    expect(resumeEvent.startIteration).toBe(1);
  });

  it('a fresh (non-resumed) run still writes loop_start, not loop_resume', async () => {
    const dir = mkTmp();
    const config = makeConfig();
    const audit = new AuditLog(path.join(dir, 'audit'), 'test-task');
    const initial = createInitialState('test-task', 'TASK.md', config.repoPath, config.maxIterations);
    const deps = makeDeps(dir, { audit });

    await runLoop(config, '# task', initial, deps);

    const events = fs
      .readFileSync(audit.path, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).event);
    expect(events).toContain('loop_start');
    expect(events).not.toContain('loop_resume');
  });
});
