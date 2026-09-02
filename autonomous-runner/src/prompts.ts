import type { PlatformContext } from './contextLoader.js';
import type { LoopState } from './types.js';

/** Shared preamble every phase gets: the platform's own contract kernel + relevant standards/rules/knowledge. */
export function buildPreamble(ctx: PlatformContext): string {
  const parts = [ctx.contractKernel];
  if (ctx.companyProfile) {
    parts.push(`## Company Profile (identity, defaults, module boundaries, banned patterns)\n${ctx.companyProfile}`);
  }
  if (ctx.standards.length) {
    parts.push('## Coding Standards (apply to any code you write)');
    for (const s of ctx.standards) parts.push(`### ${s.name}\n${s.content}`);
  }
  if (ctx.rules.length) {
    parts.push('## Rules (mandatory)');
    for (const r of ctx.rules) parts.push(`### ${r.name}\n${r.content}`);
  }
  if (ctx.knowledge.length) {
    parts.push('## Company Domain Knowledge (shared/knowledge/ — F10 seam, task-relevant topics only)');
    for (const k of ctx.knowledge) parts.push(`### ${k.name}\n${k.content}`);
  }
  if (ctx.referencedContextFiles.length) {
    parts.push('## Task-referenced context');
    for (const c of ctx.referencedContextFiles) parts.push(`### ${c.name}\n${c.content}`);
  }
  return parts.join('\n\n');
}

export function analyzeAndPlanPrompt(taskContent: string): string {
  return [
    'You are the WORKER in an autonomous AI Developer Agent loop, running the Analyze + Plan phase.',
    'Read the task document below and produce a short, concrete implementation plan: an ordered',
    'list of the files you expect to touch and what changes each needs. Do not write or edit any',
    'files in this phase — inspect the repository with read-only tools only, then output the plan',
    'as plain text. You are not the one who decides whether the final result is correct — a',
    'separate Validator will check your work after the Execute phase.',
    '',
    '## TASK DOCUMENT',
    taskContent,
  ].join('\n');
}

const RESUMED_NOTE =
  'NOTE: This process was restarted after an interruption (crash, timeout, or manual stop). ' +
  'The repository may already contain partial changes from the attempt that was interrupted. ' +
  'Before making changes, inspect the current state of the relevant files (and `git status`/' +
  '`git diff` if useful) rather than assuming a clean slate — build on what is already there ' +
  'instead of redoing work that already happened.';

export function executePrompt(taskContent: string, plan: string, resumed = false): string {
  return [
    'You are the WORKER in an autonomous AI Developer Agent loop, running the Execute phase.',
    'Implement the plan below against the task document. Make the minimal set of changes that',
    'satisfy the task — no unrelated refactors, no speculative abstractions. Use the available',
    'tools to read, write, and edit files, and to run local build/lint commands to sanity-check',
    'your own work as you go. Never run git push, git merge, git reset --hard, git clean, or any',
    'command that commits, publishes, or discards history — those are blocked and will be denied.',
    'A separate Validator will run the real build/test suite and judge completeness after you stop;',
    'do not declare the task "done" or "correct" yourself — just make the changes.',
    ...(resumed ? ['', RESUMED_NOTE] : []),
    '',
    '## TASK DOCUMENT',
    taskContent,
    '',
    '## PLAN',
    plan,
  ].join('\n');
}

export function fixPrompt(taskContent: string, plan: string, state: LoopState, previousErrors: string[], resumed = false): string {
  return [
    'You are the WORKER in an autonomous AI Developer Agent loop, running the Fix phase.',
    `This is iteration ${state.iteration} of ${state.maxIterations}. The Validator rejected the`,
    'previous attempt. Fix the specific problems listed below — do not restart from scratch and',
    'do not re-litigate parts of the plan the Validator did not flag.',
    ...(resumed ? ['', RESUMED_NOTE] : []),
    '',
    '## VALIDATOR FEEDBACK (fix these)',
    previousErrors.map((e) => `- ${e}`).join('\n') || '(no specific errors captured — re-check the task requirements)',
    '',
    '## TASK DOCUMENT',
    taskContent,
    '',
    '## ORIGINAL PLAN',
    plan,
  ].join('\n');
}

export function reviewPrompt(taskContent: string, plan: string): string {
  return [
    'You are the VALIDATOR in an autonomous AI Developer Agent loop — a distinct role from the',
    'Worker that made the changes. You did not write this code and have no stake in it looking',
    'correct; be skeptical. Using only read-only tools, inspect the current state of the',
    'repository (the Worker has already made its changes on disk) against the task document and',
    'plan below. Check for: incomplete implementation (a required layer/file missing), anything',
    'that looks like it would break existing functionality, and obvious correctness bugs in the',
    'diff. You are not responsible for build/test execution — that is checked separately.',
    'Respond only via the structured output schema you were given.',
    '',
    '## TASK DOCUMENT',
    taskContent,
    '',
    '## PLAN THAT WAS SUPPOSED TO BE IMPLEMENTED',
    plan,
  ].join('\n');
}

export const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'reasons'],
  additionalProperties: false,
} as const;
