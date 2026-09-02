/**
 * Core state and configuration types for the autonomous /dev loop.
 * Mirrors the Enterprise AI Platform's /dev contract (shared/commands/dev.md,
 * shared/contract.md) but expressed as real, persisted state instead of prose.
 */

export type LoopStatus =
  | 'PLANNING'
  | 'RUNNING'
  | 'VALIDATING'
  | 'SUCCESS'
  | 'FAILED'
  | 'MAX_ITERATIONS';

/** A sub-phase within one loop iteration — Execute and Fix are the same code path, distinguished by iteration. */
export type LoopPhase = 'analyze_plan' | 'execute' | 'fix' | 'validate';

/**
 * Marks the last phase that fully completed and was persisted. Resume logic (resume.ts) only
 * ever continues from a completed checkpoint — never from a phase that was merely started —
 * so a crash mid-phase always re-runs that phase rather than assuming partial work is safe to skip.
 */
export interface LoopCheckpoint {
  phase: LoopPhase | null;
  iteration: number;
  savedAt: string;
}

/** Equivalent of adapters/claude/hooks/hash-check.js's verdicts, for a process with no installed copy to re-inject into. */
export type ContractHashStatus = 'ok' | 'mismatch' | 'missing' | 'unavailable';

/** One iteration's worth of validator findings. */
export interface ValidationResult {
  pass: boolean;
  build?: { ran: boolean; pass: boolean; summary: string };
  test?: { ran: boolean; pass: boolean; summary: string };
  review?: { ran: boolean; pass: boolean; summary: string; reasons: string[] };
  errors: string[];
}

export interface LoopState {
  taskId: string;
  task: string;
  repoPath: string;

  status: LoopStatus;

  iteration: number;
  maxIterations: number;

  filesChanged: string[];

  toolCalls: number;
  modelCalls: number;

  buildAttempts: number;
  testAttempts: number;

  errors: string[];

  lastAction?: string;
  nextAction?: string;

  startedAt: string;
  completedAt?: string;

  /** Approximate USD cost accumulated across all model calls (from SDK result messages). */
  totalCostUsd: number;

  /** Last fully-completed phase — the resume anchor. Updated (and persisted) after every phase. */
  checkpoint: LoopCheckpoint;
  /** The Analyze/Plan phase's output, persisted so a resumed run never re-plans unnecessarily. */
  plan?: string;
  /** The most recent Validator error list, persisted so a resumed Fix phase has the right feedback. */
  lastValidationErrors: string[];
  /** SHA-256 of the task file's content at the time this run started — resume refuses a mismatch. */
  taskContentHash: string;

  /**
   * The effective hard ceiling on Task-tool (subagent) invocations for this run — see
   * RunnerConfig.agentLimit. Recorded here (not just in config) so a resumed run enforces the
   * same limit it started with, and so audit/state readers can see what was actually in force.
   */
  agentLimit: number;
  /** Running count of Task-tool invocations allowed so far, across every phase and iteration. */
  subagentInvocations: number;
  /** Result of verifying shared/contract.md's kernel against shared/contract.md.sha256 at startup. */
  contractHashStatus: ContractHashStatus;
}

export interface RunnerConfig {
  /** Absolute path to the target Git repository the loop operates on. */
  repoPath: string;
  /** Path to the task Markdown file (plan/spec/ticket), absolute or relative to repoPath. */
  taskFile: string;

  maxIterations: number;
  maxToolCallsPerPhase: number;
  maxBuildAttempts: number;
  maxTestAttempts: number;
  /** Overall wall-clock budget for the whole run, in milliseconds. */
  timeoutMs: number;

  model: string;
  fallbackModel?: string;

  /** Skip the pre-execution confirmation prompt. */
  yes: boolean;
  /** Allow running against a repo with a dirty working tree. */
  allowDirty: boolean;
  verbose: boolean;

  /**
   * Hard ceiling on Task-tool (subagent) invocations for the whole run — mirrors the interactive
   * /dev command's bounded-subagent rule (contract C4: zero by default, opt-in `agents=N` max 3),
   * but defaults to 1 (not 0) here because unattended execution has no human approving each
   * subagent decision in real time, so a single delegated helper is allowed by default while
   * still bounded. Never auto-increased at runtime — see worker.ts's canUseTool.
   */
  agentLimit: number;

  /** Root of the enterprise-ai-platform checkout this runner ships inside — source of shared/* assets. */
  platformRoot: string;
}

export interface PhaseContext {
  config: RunnerConfig;
  state: LoopState;
  taskContent: string;
  systemPromptPreamble: string;
  /** Validator feedback from the previous iteration, if any (fed back into the Fix phase). */
  previousErrors: string[];
}
