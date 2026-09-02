import path from 'node:path';
import type { LoopState } from './types.js';
import { loadState, listStateFiles } from './state.js';

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'MAX_ITERATIONS']);

export function isTerminal(state: LoopState): boolean {
  return TERMINAL_STATUSES.has(state.status);
}

export interface ResumePoint {
  plan: string;
  startIteration: number;
  startPhase: 'execute' | 'validate' | 'fix';
  previousErrors: string[];
}

/**
 * Turns a persisted checkpoint into instructions for where the loop must re-enter. Only ever
 * derived from the last *completed* phase (never a phase that was merely started) — this is
 * what makes resume safe against a crash mid-phase: the loop always re-runs whatever phase was
 * interrupted rather than assuming partial work from it is usable.
 *
 * Returns undefined when nothing was safely completed yet (checkpoint.phase is null, or no plan
 * was persisted) — the caller should restart from Analyze/Plan, same as a fresh run, just under
 * the same taskId/audit trail.
 */
export function deriveResumePoint(state: LoopState): ResumePoint | undefined {
  const cp = state.checkpoint;
  if (!cp || cp.phase === null || !state.plan) return undefined;

  switch (cp.phase) {
    case 'analyze_plan':
      // Plan is done; nothing has touched the repo yet (Analyze/Plan runs with read-only tools).
      return { plan: state.plan, startIteration: 1, startPhase: 'execute', previousErrors: [] };
    case 'execute':
    case 'fix':
      // The Worker phase for this iteration finished; go straight to Validate for the same iteration.
      return { plan: state.plan, startIteration: cp.iteration, startPhase: 'validate', previousErrors: state.lastValidationErrors };
    case 'validate':
      // Validation for this iteration finished (and didn't pass, or the loop wouldn't be resumable);
      // go to Fix for the next iteration.
      return { plan: state.plan, startIteration: cp.iteration + 1, startPhase: 'fix', previousErrors: state.lastValidationErrors };
    default:
      return undefined;
  }
}

export interface ResumeMatchResult {
  ok: boolean;
  reason?: string;
}

/**
 * Guards against resuming the wrong thing: a completed task, a different repository, or a task
 * file whose content has changed since the interrupted run started (the persisted plan would no
 * longer correspond to what's being asked for).
 */
export function validateResumeMatch(state: LoopState, repoPath: string, taskFile: string, taskContentHash: string): ResumeMatchResult {
  if (isTerminal(state)) {
    return {
      ok: false,
      reason: `Task "${state.taskId}" already completed with status ${state.status}${state.completedAt ? ` at ${state.completedAt}` : ''}. Nothing to resume — start a new run if you want to redo it.`,
    };
  }
  if (path.resolve(state.repoPath) !== path.resolve(repoPath)) {
    return {
      ok: false,
      reason: `Task "${state.taskId}" belongs to a different repository (${state.repoPath}), not ${repoPath}.`,
    };
  }
  if (path.resolve(state.task) !== path.resolve(taskFile)) {
    return {
      ok: false,
      reason: `Task "${state.taskId}" was started with a different task file (${state.task}), not ${taskFile}.`,
    };
  }
  if (state.taskContentHash && state.taskContentHash !== taskContentHash) {
    return {
      ok: false,
      reason: `The task file's content has changed since run "${state.taskId}" started (recorded hash ${state.taskContentHash.slice(0, 12)}…, current ${taskContentHash.slice(0, 12)}…). Resuming with a stale plan against a different task would be unsafe — start a fresh run instead.`,
    };
  }
  return { ok: true };
}

/**
 * Finds non-terminal, previously-persisted runs for this exact repo+task combination, most
 * recent first. Used for auto-detection ("an incomplete run exists — resume it?") and for
 * `--resume` passed with no explicit taskId.
 */
export function findResumableStates(stateDir: string, repoPath: string, taskFile: string): { taskId: string; state: LoopState }[] {
  const results: { taskId: string; state: LoopState }[] = [];
  for (const taskId of listStateFiles(stateDir)) {
    const state = loadState(stateDir, taskId);
    if (!state) continue;
    if (isTerminal(state)) continue;
    if (path.resolve(state.repoPath) !== path.resolve(repoPath)) continue;
    if (path.resolve(state.task) !== path.resolve(taskFile)) continue;
    results.push({ taskId, state });
  }
  results.sort((a, b) => (a.state.startedAt < b.state.startedAt ? 1 : -1));
  return results;
}
