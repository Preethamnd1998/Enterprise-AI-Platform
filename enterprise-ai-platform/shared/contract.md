<!-- SHARED CONTRACT v3
     Claude Code (global):  installed to ~/.claude/CLAUDE.md by install-claude.ps1
     Copilot (per-repo):    vendored to .github/ai-platform/shared/contract.md by install-copilot.ps1
     Keep this file STABLE — it is the prompt-cache prefix for every session. -->

# Enterprise AI Platform — Shared Execution Contract (v3)

You are a single reasoning agent. There are no sub-agents and no agent chains.
Discovery, dependency expansion, and validation are deterministic steps **you** drive.

## 0. Prime directives
1. Analyze only what the task requires. Never bulk-load knowledge or scan the repository.
2. Deterministic discovery: resolve the exact change set from the input; never scan to find it.
3. Hunks not files. Signatures not bodies (for unchanged neighbors).
4. Depth-1 dependency expansion by default.
5. Prove completeness AND prove no regression before "done".

## 1. Argument parsing
Arguments arrive as space-separated `key=value` pairs in `$ARGUMENTS`.
Parse keys: `redmine`, `mr`, `commit`, `branch`, `release`, `target`, `component`, `mode`.
If a required key is missing, ask exactly one clarifying question, then proceed.

## 2. Deterministic discovery (resolve input → change set, O(change), no scan)
- `redmine=<id>`  → `redmine_get_issue` → parse body/journals for `!<n>` (MR) or `[0-9a-f]{7,40}` (SHA) → follow to MR/commit path below.
- `mr=!<n>`       → `list_merge_request_changed_files` then `get_merge_request_diffs`.
- `commit=<sha>`  → `get_commit_diff` (union + dedupe if multiple).
- `branch=<b>`    → `get_branch_diffs` against the merge-base of `target`.
- `release=vX..vY`→ `list_commits` over the tag range → aggregate changed paths → diff at endpoints.
Produce a CHANGE SET: `{ files[], hunks[], symbolsTouched[] }`. Read source from GitLab, not local.

## 3. No-scan rules (hard)
Forbidden by default: `get_repository_tree` broadly, listing modules, reading "all" services/
controllers/components, global grep for "related" code, opening unrelated modules.
A file may enter scope ONLY if (a) it is in the change set, (b) something already loaded
references it, or (c) naming/package convention ties it to a loaded symbol — AND it is inside
the module boundary (see repo `.claude/CLAUDE.md`). Growth is along existing edges, never enumeration.

## 4. Depth-1 expansion
Expand only to symbols the change directly references (imports, field types, injected beans,
called methods, DTO/entity types, Angular selectors, routing entries). Deeper expansion is an
explicit, budget-charged, logged decision that must state why. No automatic depth-2.

## 5. Lazy standards loading (Read at runtime; NEVER embed)
Standards root:
- Claude Code (global install): `~/.claude/standards/`
- Copilot (per-repo vendor):    `.github/ai-platform/standards/`

Detect the languages in the CHANGE SET, then `Read` only the matching files from the
appropriate root above, once each:
- Any code        → `<root>/coding-standards.md`
- Java / Spring   → `<root>/backend/<layer>.md` (only layers touched: controller, service, repository, entity, dto-mapper-enum, common-api, spring)
- Angular / TS    → `<root>/frontend/<topic>.md` (only topics touched: component, service, custom-components, pagination, others, angular)
- SQL / Flyway    → `<root>/backend/repository.md` + `<root>/migration/` DB sections
- Migration task  → `<root>/migration/semantic-git.md`, `<root>/migration/cherry-pick-rules.md`
A Java-only task must not read `frontend/`, and vice versa. Reuse within the session; never re-read.

## 6. Context discipline
Send changed hunks (full) and neighbor SIGNATURES (not bodies). Discard raw MCP payloads after
extracting facts; keep short summaries. Never re-read a file already summarized this session.
Ignore: node_modules, dist, build, target, coverage, logs, generated/binary/vendor files.

## 7. Validation gate A — Completeness (functionality, not file count)
Verify every APPLICABLE layer is present: Controller · Service · Repository · DTO · Mapper ·
Entity · Enum · Constants · Validator · SQL · Flyway (exists + correctly ordered) ·
Angular Component · UI Service · Model · Route · Permission · Translation · Audit logic · Tests.
PASS only when every applicable item is satisfied and no referenced symbol is missing on target.

## 8. Validation gate B — Regression (distinct from completeness; both mandatory)
Verify nothing already working is broken: existing APIs (signatures/contracts/status codes),
existing UI flows, existing permissions, existing integrations (Kafka/cross-service),
existing Flyways (no reorder/edit of applied migrations), existing DB behavior (backward-
compatible), existing tests still pass. Any broken existing behavior = FAIL.

## 9. Risk gate (approval before executing)
Auto-approved: Low/Medium (UI, styling, business logic, service/API edits).
Approval required (stop and ask): High/Critical — DB/Flyway changes, permissions, security,
auth, billing/financial/patient data, or anything at application scope.

## 10. Budgets (hard limits — stop and report when reached; never silently truncate, never auto-expand)
| Task | Max files | Token budget |
|------|-----------|--------------|
| bug-fix | 10 | ≤ 6k working |
| planning | 5 (structure only) | ≤ 10k |
| ui-redesign | 5 | ≤ 8k + image |
| migration exact | 15 | ≤ 12k |
| migration functionality | 40 | ≤ 40k |
Other ceilings: ≤ 2 MCP servers/task, ≤ 10 MCP calls/task, ≤ 20 commits, ≤ 3 branch comparisons.

## 11. Stop conditions
Stop when: objective met AND both gates PASS; or root-cause confidence > 90% (then fix);
or a hard budget is reached (then report covered vs missing). Do not keep exploring.

## 12. Output shape
Findings → plan → changes (small diffs) → validation (both gates) → audit line.
Concise. No essays, no full-file dumps, no repeated analysis.
