/**
 * Deterministic safety gate for the autonomous loop.
 *
 * The platform contract (shared/contract.md §2, §8) and this repo's kernel rule are explicit:
 * git stays read-only, no push/merge/history-rewrite, no destructive DB operations, unless a
 * human explicitly instructs it in-session. There is no human in this loop turn-by-turn, so
 * these denials are unconditional — no CLI flag or prompt content can bypass them.
 *
 * The Bash/DB-path denials below are reconciled with, not duplicated from, the platform's own
 * `adapters/claude/config/settings.json`: every pattern in that file's `permissions.deny` has an
 * equivalent here (git push/commit, rm -rf, flyway), and every `permissions.ask` entry (DB
 * migration file edits) is *denied* rather than "asked" — there is no human to ask in an
 * unattended run, so the fail-closed choice is to refuse rather than silently proceed. MCP tool
 * gating goes further: `evaluateMcpTool` consults that same settings.json's `permissions.allow`
 * list as the single source of truth (see contextLoader.ts#loadMcpAllowlist) instead of guessing
 * from tool-name shape.
 */

export interface SafetyDecision {
  allow: boolean;
  reason?: string;
}

const DENIED_BASH_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bgit\s+push\b/i, reason: 'git push is never allowed from the autonomous loop' },
  { pattern: /\bgit\s+commit\b/i, reason: 'git commit is never allowed from the autonomous loop (matches adapters/claude/config/settings.json\'s deny list)' },
  { pattern: /\bgit\s+merge\b/i, reason: 'git merge is never allowed from the autonomous loop' },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'git reset --hard is never allowed from the autonomous loop' },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/i, reason: 'git clean -f is never allowed from the autonomous loop' },
  { pattern: /\bgit\s+checkout\s+(--\s+)?\.\s*$/i, reason: 'git checkout . (discarding working-tree changes) is never allowed' },
  { pattern: /\bgit\s+branch\s+-D\b/i, reason: 'force branch deletion is never allowed' },
  { pattern: /\bgit\s+.*--force\b/i, reason: 'any git --force operation is never allowed' },
  { pattern: /\bgit\s+rebase\b/i, reason: 'git rebase (history rewrite) is never allowed' },
  { pattern: /\bgit\s+filter-branch\b/i, reason: 'git filter-branch is never allowed' },
  { pattern: /\bgh\s+pr\s+(create|merge)\b/i, reason: 'creating or merging PRs is never allowed from the autonomous loop' },
  { pattern: /\bgh\s+release\b/i, reason: 'publishing releases is never allowed from the autonomous loop' },
  { pattern: /\brm\s+-rf\s+\/(?!\S)/i, reason: 'rm -rf on a filesystem root is never allowed' },
  { pattern: /\brm\s+-rf\s+\.\.(\/|\\)/i, reason: 'rm -rf traversing outside the working tree is never allowed' },
  { pattern: /\bflyway\b/i, reason: 'flyway CLI invocations are never allowed from the autonomous loop (matches adapters/claude/config/settings.json\'s deny list) — DB migrations require human review' },
  { pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i, reason: 'destructive DDL is never allowed' },
  { pattern: /\bDELETE\s+FROM\b/i, reason: 'destructive/mutating SQL is never allowed' },
  { pattern: /\bUPDATE\s+\S+\s+SET\b/i, reason: 'destructive/mutating SQL is never allowed' },
  { pattern: /\bmongosh?\b.*\.(deleteMany|deleteOne|drop|updateMany|updateOne)\s*\(/i, reason: 'destructive Mongo write operations are never allowed' },
  { pattern: /\bnpm\s+publish\b/i, reason: 'publishing packages is never allowed from the autonomous loop' },
  { pattern: /\bdocker\s+(push|rmi)\b/i, reason: 'docker push/rmi is never allowed from the autonomous loop' },
  { pattern: /\bkubectl\s+(delete|apply)\b/i, reason: 'cluster mutation via kubectl is never allowed' },
  { pattern: /\bshutdown\b|\breboot\b/i, reason: 'host power operations are never allowed' },
];

/**
 * Mirrors adapters/claude/config/settings.json's `permissions.ask` list — any Edit/Write glob
 * under a db/migration directory. The interactive contract asks a human before touching these;
 * an unattended run has no one to ask, so it denies instead — strictly more conservative, never less.
 */
const DB_MIGRATION_PATH_PATTERN = /(^|[/\\])db[/\\]migration[/\\]/i;

/** Secret-like substrings that must never be written to logs, even truncated. */
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9\-_]+/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /AKIA[0-9A-Z]{16}/g,
  /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
];

export function evaluateBashCommand(command: string): SafetyDecision {
  for (const { pattern, reason } of DENIED_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return { allow: false, reason };
    }
  }
  return { allow: true };
}

export function evaluateFileWritePath(filePath: string): SafetyDecision {
  if (DB_MIGRATION_PATH_PATTERN.test(filePath)) {
    return {
      allow: false,
      reason: `"${filePath}" is a DB migration file — adapters/claude/config/settings.json requires human approval (permissions.ask) for these, and there is no human to ask in an unattended run, so it is denied`,
    };
  }
  return { allow: true };
}

/**
 * Fail-closed against the platform's real allowlist (adapters/claude/config/settings.json's
 * `permissions.allow`), not a name-shape guess. When the allowlist could not be loaded at all
 * (contextLoader.ts#loadMcpAllowlist returned undefined), every MCP tool is denied — matching
 * that same settings.json's own base rule (`"deny": ["mcp__*"]`, allowlist-or-nothing).
 */
export function evaluateMcpTool(toolName: string, mcpAllowlist: Set<string> | undefined): SafetyDecision {
  if (!mcpAllowlist) {
    return {
      allow: false,
      reason: `MCP allowlist unavailable (adapters/claude/config/settings.json could not be read) — "${toolName}" denied fail-closed`,
    };
  }
  if (!mcpAllowlist.has(toolName)) {
    return {
      allow: false,
      reason: `"${toolName}" is not in adapters/claude/config/settings.json's permissions.allow — MCP tools fail closed unless explicitly allow-listed there`,
    };
  }
  return { allow: true };
}

/** A hard, monotonically-increasing ceiling on Task-tool (subagent) invocations for one run. */
export interface AgentBudget {
  limit: number;
  used: number;
}

/**
 * Pure decision function for whether one more subagent may be spawned — kept separate from the
 * counter mutation (worker.ts increments `budget.used` only after this returns allow) so it's
 * unit-testable without a live SDK session. Applies uniformly to top-level and nested/recursive
 * Task calls: the SDK routes every tool use through the same `canUseTool` gate regardless of
 * which agent (top-level or a subagent) issued it, so one shared budget object bounds the total
 * across the whole run, not just the first level.
 */
export function evaluateSubagentSpawn(budget: AgentBudget): SafetyDecision {
  if (budget.used >= budget.limit) {
    return {
      allow: false,
      reason: `agentLimit reached (${budget.used}/${budget.limit}) — subagent creation is blocked for the rest of this run`,
    };
  }
  return { allow: true };
}

/**
 * Central gate called from the SDK's canUseTool callback. Everything not explicitly denied
 * here is allowed to proceed — the SDK's own permission system + the target repo's own
 * .gitignore/branch protections remain the second line of defense.
 *
 * Task-tool (subagent) calls are NOT decided here — see `evaluateSubagentSpawn`, called
 * separately by worker.ts because it needs to mutate the shared budget counter, which this
 * function deliberately stays free of side effects for.
 */
export function evaluateToolUse(toolName: string, input: Record<string, unknown>, mcpAllowlist?: Set<string>): SafetyDecision {
  if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    return evaluateBashCommand(command);
  }
  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = typeof input.file_path === 'string' ? input.file_path : '';
    if (filePath) return evaluateFileWritePath(filePath);
  }
  if (toolName.startsWith('mcp__')) {
    return evaluateMcpTool(toolName, mcpAllowlist);
  }
  return { allow: true };
}

export function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}
