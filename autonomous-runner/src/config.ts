import path from 'node:path';
import fs from 'node:fs';
import type { RunnerConfig } from './types.js';

export interface CliInput {
  repo: string;
  task: string;
  maxIterations?: string;
  maxToolCallsPerPhase?: string;
  maxBuildAttempts?: string;
  maxTestAttempts?: string;
  timeoutSeconds?: string;
  model?: string;
  fallbackModel?: string;
  yes?: boolean;
  allowDirty?: boolean;
  verbose?: boolean;
  agentLimit?: string;
}

const DEFAULTS = {
  maxIterations: 5,
  maxToolCallsPerPhase: 40,
  maxBuildAttempts: 3,
  maxTestAttempts: 3,
  timeoutSeconds: 1800,
  model: 'claude-opus-5',
  fallbackModel: 'claude-sonnet-5',
  /**
   * Automatic/default /dev execution gets at most 1 subagent — stricter than the interactive
   * command's own opt-in-3 (contract C4), because there is no human approving each subagent
   * decision in real time here. An explicit --agent-limit may raise this, but never past the
   * platform's own bounded-subagent ceiling (contract C4: max 3) — see parseAgentLimit.
   */
  agentLimit: 1,
};

const MAX_AGENT_LIMIT = 3;

function parseAgentLimit(value: string | undefined): number {
  if (value === undefined) return DEFAULTS.agentLimit;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== value.trim()) {
    throw new Error(`Invalid --agent-limit: "${value}" (must be a non-negative integer)`);
  }
  if (n > MAX_AGENT_LIMIT) {
    throw new Error(
      `Invalid --agent-limit: ${n} exceeds the platform's bounded-subagent ceiling of ${MAX_AGENT_LIMIT} ` +
        '(shared/contract.md kernel, C4 — the same cap the interactive /dev command\'s multi-agent mode enforces).',
    );
  }
  return n;
}

function parseIntOr(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${label}: "${value}" (must be a positive integer)`);
  }
  return n;
}

/**
 * Resolves the enterprise-ai-platform repo root this package ships inside, so shared
 * commands/standards/rules can be reused without depending on any local-machine path.
 * autonomous-runner/dist/config.js -> ../.. is the platform root; autonomous-runner/src -> ../.. also works
 * for `npm run dev` (tsx).
 */
export function resolvePlatformRoot(fromDir: string): string {
  let dir = fromDir;
  for (let i = 0; i < 5; i++) {
    const marker = path.join(dir, 'shared', 'commands', 'dev.md');
    if (fs.existsSync(marker)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate the enterprise-ai-platform root (looked for shared/commands/dev.md above ${fromDir}). ` +
      'autonomous-runner must remain inside the platform checkout, or pass AI_RUNNER_PLATFORM_ROOT.',
  );
}

export function buildConfig(input: CliInput, fromDir: string): RunnerConfig {
  const repoPath = path.resolve(input.repo);
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new Error(`--repo path does not exist or is not a directory: ${repoPath}`);
  }
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    throw new Error(`--repo path is not a Git repository (no .git found): ${repoPath}`);
  }

  const taskFile = path.isAbsolute(input.task) ? input.task : path.resolve(repoPath, input.task);
  if (!fs.existsSync(taskFile)) {
    throw new Error(`--task file not found: ${taskFile}`);
  }

  const platformRoot = process.env.AI_RUNNER_PLATFORM_ROOT
    ? path.resolve(process.env.AI_RUNNER_PLATFORM_ROOT)
    : resolvePlatformRoot(fromDir);

  const timeoutSeconds = parseIntOr(input.timeoutSeconds, DEFAULTS.timeoutSeconds, '--timeout');

  return {
    repoPath,
    taskFile,
    maxIterations: parseIntOr(input.maxIterations, DEFAULTS.maxIterations, '--max-iterations'),
    maxToolCallsPerPhase: parseIntOr(input.maxToolCallsPerPhase, DEFAULTS.maxToolCallsPerPhase, '--max-tool-calls-per-phase'),
    maxBuildAttempts: parseIntOr(input.maxBuildAttempts, DEFAULTS.maxBuildAttempts, '--max-build-attempts'),
    maxTestAttempts: parseIntOr(input.maxTestAttempts, DEFAULTS.maxTestAttempts, '--max-test-attempts'),
    timeoutMs: timeoutSeconds * 1000,
    model: input.model ?? process.env.AI_RUNNER_MODEL ?? DEFAULTS.model,
    fallbackModel: input.fallbackModel ?? process.env.AI_RUNNER_FALLBACK_MODEL ?? DEFAULTS.fallbackModel,
    yes: Boolean(input.yes),
    allowDirty: Boolean(input.allowDirty),
    verbose: Boolean(input.verbose),
    platformRoot,
    agentLimit: parseAgentLimit(input.agentLimit),
  };
}
