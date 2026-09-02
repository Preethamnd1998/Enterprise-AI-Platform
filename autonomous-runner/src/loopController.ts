import type { LoopState, RunnerConfig, ValidationResult } from './types.js';
import type { AuditLog } from './audit.js';
import type { StateStore } from './state.js';
import type { ResumePoint } from './resume.js';
import { changedFiles } from './gitUtils.js';

export interface AnalyzePlanFn {
  (taskContent: string): Promise<{ plan: string; costUsd: number; toolCalls: number; subagentInvocations: number }>;
}
export interface ExecuteFn {
  (taskContent: string, plan: string, state: LoopState, previousErrors: string[]): Promise<{ costUsd: number; toolCalls: number; isError: boolean; errors: string[]; subagentInvocations: number }>;
}
export interface ValidateFn {
  (taskContent: string, plan: string): Promise<ValidationResult>;
}

export interface LoopDeps {
  analyzeAndPlan: AnalyzePlanFn;
  execute: ExecuteFn;
  validate: ValidateFn;
  audit: AuditLog;
  stateStore: StateStore;
  /** For tests: override how "files changed" is measured instead of shelling out to git. */
  getChangedFiles?: (repoPath: string) => string[];
}

export interface LoopResult {
  state: LoopState;
  finalValidation?: ValidationResult;
}

/**
 * Presence of this object (even with `point` undefined) means "continue an existing taskId" —
 * the loop writes `loop_resume` instead of `loop_start` and reuses initialState's counters.
 * `point` undefined means the checkpoint had nothing safely completed yet (e.g. crashed mid
 * Analyze/Plan), so the loop still re-runs Analyze/Plan, just under the same taskId/audit trail.
 */
export interface ResumeOptions {
  point?: ResumePoint;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Bounded Analyze -> Plan -> Execute -> Validate -> Fix loop (PHASE 3 of the design).
 * Every stop condition is explicit: SUCCESS (validator passed), FAILED (build/test attempt
 * ceiling hit), or MAX_ITERATIONS (iteration ceiling hit). There is no path that loops forever —
 * every branch below either continues the for-loop toward its bound or returns.
 *
 * A checkpoint (`state.checkpoint`) is written and persisted immediately after every phase
 * completes (Analyze/Plan, Execute, Fix, Validate) — see resume.ts for how a crash between
 * checkpoints is turned back into a safe re-entry point.
 */
export async function runLoop(
  config: RunnerConfig,
  taskContent: string,
  initialState: LoopState,
  deps: LoopDeps,
  resume?: ResumeOptions,
): Promise<LoopResult> {
  const state = { ...initialState };
  const getChanged = deps.getChangedFiles ?? changedFiles;
  const persist = () => deps.stateStore.save(state);
  const resumePoint = resume?.point;

  if (resume) {
    deps.audit.write('loop_resume', state.taskId, {
      task: state.task,
      repoPath: state.repoPath,
      resumedFromStatus: initialState.status,
      resumedFromIteration: initialState.iteration,
      resumedFromPhase: initialState.checkpoint?.phase ?? null,
      startIteration: resumePoint?.startIteration ?? 1,
      startPhase: resumePoint?.startPhase ?? 'analyze_plan',
      agentLimit: state.agentLimit,
      subagentInvocationsSoFar: state.subagentInvocations,
      contractHashStatus: state.contractHashStatus,
    });
  } else {
    deps.audit.write('loop_start', state.taskId, {
      task: state.task,
      repoPath: state.repoPath,
      maxIterations: state.maxIterations,
      agentLimit: state.agentLimit,
      contractHashStatus: state.contractHashStatus,
    });
  }

  let plan: string;
  let previousErrors: string[];
  let startIteration: number;
  let skipExecuteOnce = false;

  if (resumePoint) {
    plan = resumePoint.plan;
    previousErrors = resumePoint.previousErrors;
    startIteration = resumePoint.startIteration;
    skipExecuteOnce = resumePoint.startPhase === 'validate';
    state.status = 'RUNNING';
  } else {
    // Fresh Analyze/Plan — either a genuinely new run, or a resume where nothing was safely
    // completed yet (crash happened before the first checkpoint).
    state.status = 'PLANNING';
    state.lastAction = 'analyze_plan';
    persist();
    deps.audit.write('phase_start', state.taskId, { phase: 'analyze_plan', iteration: 0 });

    const planResult = await deps.analyzeAndPlan(taskContent);
    state.modelCalls += 1;
    state.toolCalls += planResult.toolCalls;
    state.totalCostUsd += planResult.costUsd;
    state.subagentInvocations = planResult.subagentInvocations;
    plan = planResult.plan;
    state.plan = plan;
    state.checkpoint = { phase: 'analyze_plan', iteration: 0, savedAt: nowIso() };
    persist();

    deps.audit.write('phase_end', state.taskId, {
      phase: 'analyze_plan',
      costUsd: planResult.costUsd,
      toolCalls: planResult.toolCalls,
      subagentInvocations: planResult.subagentInvocations,
      agentLimit: state.agentLimit,
    });

    previousErrors = [];
    startIteration = 1;
  }

  let finalValidation: ValidationResult | undefined;

  for (state.iteration = startIteration; state.iteration <= state.maxIterations; state.iteration++) {
    state.status = 'RUNNING';
    const skipExecuteThisPass = skipExecuteOnce && state.iteration === startIteration;

    if (!skipExecuteThisPass) {
      state.lastAction = state.iteration === 1 ? 'execute' : 'fix';
      state.nextAction = 'validate';
      persist();
      deps.audit.write('iteration_start', state.taskId, { iteration: state.iteration });
      deps.audit.write('phase_start', state.taskId, { phase: state.lastAction, iteration: state.iteration });

      const execResult = await deps.execute(taskContent, plan, state, previousErrors);
      state.modelCalls += 1;
      state.toolCalls += execResult.toolCalls;
      state.totalCostUsd += execResult.costUsd;
      state.subagentInvocations = execResult.subagentInvocations;
      state.filesChanged = getChanged(state.repoPath);

      deps.audit.write('phase_end', state.taskId, {
        phase: state.lastAction,
        iteration: state.iteration,
        costUsd: execResult.costUsd,
        toolCalls: execResult.toolCalls,
        isError: execResult.isError,
        filesChanged: state.filesChanged.length,
        subagentInvocations: execResult.subagentInvocations,
        agentLimit: state.agentLimit,
      });

      if (execResult.isError) {
        state.errors.push(...execResult.errors);
      }

      state.checkpoint = { phase: state.lastAction as 'execute' | 'fix', iteration: state.iteration, savedAt: nowIso() };
      persist();
    } else {
      state.lastAction = 'validate';
      deps.audit.write('iteration_start', state.taskId, { iteration: state.iteration, resumed: true });
      deps.audit.write('phase_skip', state.taskId, {
        phase: state.iteration === 1 ? 'execute' : 'fix',
        iteration: state.iteration,
        reason: 'already completed before the crash — resuming directly at Validate',
      });
      state.filesChanged = getChanged(state.repoPath);
    }

    state.status = 'VALIDATING';
    state.lastAction = 'validate';
    persist();
    deps.audit.write('phase_start', state.taskId, { phase: 'validate', iteration: state.iteration });

    const validation = await deps.validate(taskContent, plan);
    finalValidation = validation;
    if (validation.build?.ran) state.buildAttempts += 1;
    if (validation.test?.ran) state.testAttempts += 1;

    deps.audit.write('validate_result', state.taskId, {
      iteration: state.iteration,
      pass: validation.pass,
      buildPass: validation.build?.pass,
      testPass: validation.test?.pass,
      reviewPass: validation.review?.pass,
      errors: validation.errors,
    });

    state.checkpoint = { phase: 'validate', iteration: state.iteration, savedAt: nowIso() };
    state.lastValidationErrors = validation.errors;
    persist();

    if (validation.pass) {
      state.status = 'SUCCESS';
      state.completedAt = nowIso();
      persist();
      deps.audit.write('loop_end', state.taskId, { status: state.status, iteration: state.iteration });
      return { state, finalValidation };
    }

    state.errors.push(...validation.errors);
    previousErrors = validation.errors;

    const buildExhausted = validation.build?.ran && !validation.build.pass && state.buildAttempts >= config.maxBuildAttempts;
    const testExhausted = validation.test?.ran && !validation.test.pass && state.testAttempts >= config.maxTestAttempts;
    if (buildExhausted || testExhausted) {
      state.status = 'FAILED';
      state.completedAt = nowIso();
      state.nextAction = undefined;
      persist();
      deps.audit.write('loop_end', state.taskId, {
        status: state.status,
        iteration: state.iteration,
        reason: buildExhausted ? 'max_build_attempts_reached' : 'max_test_attempts_reached',
      });
      return { state, finalValidation };
    }
    // otherwise: fall through to the next for-loop iteration (Fix phase)
  }

  state.iteration = state.maxIterations;
  state.status = 'MAX_ITERATIONS';
  state.completedAt = nowIso();
  state.nextAction = undefined;
  persist();
  deps.audit.write('loop_end', state.taskId, { status: state.status, iteration: state.iteration });
  return { state, finalValidation };
}
