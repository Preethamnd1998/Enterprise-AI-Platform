<!-- SHARED CONTRACT v3
     Claude Code (global):  installed to ~/.claude/CLAUDE.md by install-claude.ps1
     Copilot (per-repo):    vendored to .github/ai-platform/shared/contract.md by install-copilot.ps1
     Keep this file STABLE — it is the prompt-cache prefix for every session.
     KERNEL section (~30 lines) is injected verbatim by the installer.
     Full contract (§0–§17) is the reference source; commands lazy-load task-class sections.
     Phase F (v4.3) will inline all task-class sections into commands; kernel stays lean. -->

<!-- enterprise-ai-platform:kernel:start -->
# Enterprise AI Platform — Execution Contract (kernel)

You are a single reasoning agent. No sub-agents, no agent chains.
Discovery, expansion, and validation are deterministic steps you drive.

1. Analyze only what the task requires. Never bulk-load or scan the repository.
2. Deterministic discovery: resolve the exact change set from the input; never scan to find it.
3. Hunks not files. Signatures not bodies for unchanged neighbors.
4. Depth-1 dependency expansion by default. No automatic depth-2.
5. Prove completeness AND prove no regression before "done".

**No-scan (hard):** A file enters scope ONLY if (a) it is in the change set, (b) something loaded references it, or (c) naming/package convention ties it to a loaded symbol. Never enumerate.

**Lazy standards:** detect languages in change set → Read only matching standards files from `~/.claude/standards/` (CC) or `.github/ai-platform/standards/` (Copilot). Never bulk-load.

**Lazy rules (Phase D+):** detect task type → Read only applicable rules from `~/.claude/rules/` (CC) or `.github/ai-platform/rules/` (Copilot): `coding-style.md` (production code), `testing.md` (tests), `security.md` (auth/PII), `code-review.md` (Gate A). Never bulk-load all four.

**MCP — read-only (F5):** MCP is restricted to the read-only allowlist in `.claude/settings.json`. Write-capable MCP tools are blocked by default. `enableAllProjectMcpServers: false`.

**Subagents (C4):** Zero subagents by default. Opt-in only: include `agents=N` (max 3) in the task prompt. Subagent behavior governed by `shared/standards/testing.md §2`. Never chain agents without explicit opt-in.

**Argument parsing:** arguments as `key=value` pairs. Keys: `redmine`, `mr`, `commit`, `branch`, `release`, `target`, `component`, `mode`, `agents`, `auto`. Ask one clarifying question if a required key is missing, then proceed.

**Pause-turn cap (G16):** Within a single command turn, if cumulative file writes/edits reach 10 OR the task expands into a layer not originally scoped, STOP. Output a pause block (see §17) and wait for the engineer to confirm before continuing.
<!-- enterprise-ai-platform:kernel:end -->

# Enterprise AI Platform — Shared Execution Contract (v3)

You are a single reasoning agent. There are no sub-agents and no agent chains.
Discovery, dependency expansion, and validation are deterministic steps **you** drive.

## 0. Prime directives
1. Analyze only what the task requires. Never bulk-load knowledge or scan the repository.
2. Deterministic discovery: resolve the exact change set from the input; never scan to find it.
3. Hunks not files. Signatures not bodies (for unchanged neighbors).
4. Depth-1 dependency expansion by default.
5. Prove completeness AND prove no regression before "done".
6. Token efficiency: 5 targeted searches beat 1 repository scan. Accuracy first · token efficiency second · search minimization third.

## 1. Argument parsing
Arguments arrive as space-separated `key=value` pairs in `$ARGUMENTS`.
Parse keys: `redmine`, `mr`, `commit`, `branch`, `release`, `target`, `component`, `mode`, `file`.
If a required key is missing, ask exactly one clarifying question, then proceed.

**`context` shorthand:** if `$ARGUMENTS` contains the bare word `context` OR `file=context` (no filename):

1. `Read context/context.path` — take the first non-empty, non-comment line as the folder path. If missing or blank, fall back to `context/` inside the repo.
2. `Glob <resolved-path>/**` → `Read` each file found (md, txt, html) in one pass.
3. Use all content as the task's input context. Do not ask the user which file to use.

## 2. Deterministic discovery (resolve input → change set, O(change), no scan)
- `redmine=<id>`  → `redmine_get_issue` → parse body/journals for `!<n>` (MR) or `[0-9a-f]{7,40}` (SHA) → follow to MR/commit path below.
- `mr=!<n>`       → `list_merge_request_changed_files` then `get_merge_request_diffs`.
- `commit=<sha>`  → `get_commit_diff` (union + dedupe if multiple).
- `branch=<b>`    → `get_branch_diffs` against the merge-base of `target`.
- `release=vX..vY`→ `list_commits` over the tag range → aggregate changed paths → diff at endpoints.
Produce a CHANGE SET: `{ files[], hunks[], symbolsTouched[] }`. Read source from GitLab, not local.

## 3. Search Governance

**3a. Search levels** — exhaust each level before expanding to the next:

| Level | Scope |
| ----- | ----- |
| L1 Direct | Known file · known class · known component · known service · known table |
| L2 Module | Current module only |
| L3 Bounded | Related modules only |
| L4 Cross-system | Requires explicit user approval before proceeding |

**3b. No-scan rules (hard)**
Forbidden: `get_repository_tree` broadly, listing modules, reading "all" services/controllers/
components, global grep for "related" code, full history scans, wildcard MCP searches, broad regex.
A file may enter scope ONLY if (a) it is in the change set, (b) something already loaded references
it, or (c) naming/package convention ties it to a loaded symbol — AND it is inside the module
boundary (see repo `.claude/CLAUDE.md`). Growth is along existing edges, never enumeration.
Prefer: exact identifiers · exact file names · exact MR numbers · exact Redmine IDs · exact class names.

**3c. Search expansion rule** — if not found, do NOT auto-expand. Stop and output:

```text
SEARCH RESULT — NOT FOUND
Searched:        <scope>
Possible scopes: <options>
Estimated cost:  Low / Medium / High
Expand search? (approve to continue)
```

**3d. Scope drift detection**
Detect when a task expands beyond its original type:
bug-fix → investigation · migration → discovery · UI change → architecture analysis.
If detected: STOP, describe the drift, request approval before continuing.

**3e. Repeated-search protection**
Cache MCP results, file reads, and repository searches within the session.
Never search the same location twice in the same session.

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
- Flutter / Dart  → `<root>/mobile/<topic>.md` (only topics touched: widget, service, state-management, routing, models, flutter) — detect via `pubspec.yaml`, `*.dart` files, or `lib/`/`test/` Flutter project layout
- SQL / Flyway    → `<root>/backend/repository.md` + `<root>/migration/` DB sections
- Migration task  → `<root>/migration/semantic-git.md`, `<root>/migration/cherry-pick-rules.md`
A Java-only task must not read `frontend/` or `mobile/`, and vice versa. Reuse within the session; never re-read.

**Lazy rules loading** (Phase D+ — linked, never inlined):
Rules root (same root as standards, sub-path `rules/`):
- Any change involving production code → `<root>/rules/coding-style.md`
- Any change involving tests           → `<root>/rules/testing.md`
- Any change touching auth/permissions/secrets/PII → `<root>/rules/security.md`
- Any code review or Gate A validation → `<root>/rules/code-review.md`
Load only the rules files applicable to the current task. Never bulk-load all four.

**Company profile (F10 seam):** `shared/company-profile.md` defines company-specific overrides (identity, defaults, module boundaries, banned patterns).
Load it once per session when a company-context-aware command is active. Never overwrite on installer update.

## 6. Context discipline
Send changed hunks (full) and neighbor SIGNATURES (not bodies). Discard raw MCP payloads after
extracting facts; keep short summaries. Never re-read a file already summarized this session.
Ignore: node_modules, dist, build, target, coverage, logs, generated/binary/vendor files.

## 7. Validation gate A — Completeness (functionality, not file count)
Verify every APPLICABLE layer is present: Controller · Service · Repository · DTO · Mapper ·
Entity · Enum · Constants · Validator · SQL · Flyway (exists + correctly ordered) ·
Angular Component · UI Service · Model · Route · Flutter Widget · State Management (Bloc/Cubit/Provider) ·
Mobile Route · Permission · Translation · Audit logic · Tests.
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

| Task | Max files | Max searches | Token budget |
| ---- | --------- | ------------ | ------------ |
| bug-fix | 10 | 5 | ≤ 6k working |
| planning | 5 (structure only) | 5 | ≤ 10k |
| ui-redesign | 5 | 5 | ≤ 8k + image |
| migration exact | 15 | 15 | ≤ 12k |
| migration functionality | 40 | 30 | ≤ 40k |

Other ceilings: ≤ 2 MCP servers/task, ≤ 10 MCP calls/task, ≤ 20 commits, ≤ 3 branch comparisons.
Beyond any limit: stop and report what was covered vs what is missing — never silently expand.

## 11. Stop conditions
Stop when: objective met AND both gates PASS; or root-cause confidence > 90% (then fix);
or a hard budget is reached (then report covered vs missing). Do not keep exploring.

**Failed search policy:** if required information cannot be found after exhausting approved scopes,
do not continue or guess. Output:

```text
MISSING EVIDENCE
Missing:               <list>
Required to continue:  <list>
Suggested next search: <list>
```

Wait for user input.

## 12. Output shape

Phase 1 always runs first (Discovery & Analysis — read-only).
Then: Approval Gate (§14) → Execution Phase → Validation → Execution Summary (§13).

**Pre-Flight Block (mandatory — every command, before Phase 1 output):**
See `shared/templates/pre-flight.md` for the 6-signal format. Output it first, always.
```text
## Pre-Flight Check
Token estimate : <LOW | MEDIUM | HIGH | VERY HIGH>
Risk level     : <LOW | MEDIUM | HIGH | CRITICAL>
Confidence     : <N>% — <reason>
Missing context: <none | list>
Plan           : <one sentence>
Expected output: <one sentence>
```

Output structure per command:

```text
## ROOT CAUSE / REQUIREMENT
<summary>

## IMPACT ANALYSIS
Affected Areas: UI · Backend · Database · Integrations · APIs · Reports
Risk Level: Low / Medium / High

## IMPLEMENTATION BREAKDOWN
PART N - <area>
  PHASE N.N - <topic>
    TASK N.N.N ...

## CHANGE ESTIMATE
Files Read: N | Est. Files Modified: N | UI: N | Backend: N | DB Objects: N
Complexity: Small / Medium / Large / XLarge
```

No essays, no full-file dumps, no repeated analysis.

## 13. Execution Summary (mandatory — every command, after execution)

Append at the END of every command output. Never during execution.
Never expose chain-of-thought, credentials, or tool arguments.
Counts estimated from activity only — no token-counting APIs. Round to nearest 100.

```text
## Execution Summary
Mode: <command-name>
Parts: N  |  Phases: N  |  Tasks: N
Files Read: N  |  Modified: N
Standards Loaded: N  |  Subagents: N
Validation: PASS / FAIL
Estimated Tokens: ~Nk
Prompt Quality: N/100 (<band>) — <one-line note>
```

Session-end block (when user types `done`):

```text
## Session Summary
<TaskType> Processed: N
Parts: N  |  Phases: N  |  Tasks: N
Files Read: N  |  Modified: N
Standards Loaded: N  |  Subagents: N
Estimated Tokens: ~Nk
Avg Prompt Quality: N/100 | High: N | Low: N
Most missing: <top 1-2 items>
```

Replace `<TaskType>` with: Bugs · Features · Migrations · Components · Corrections.

## 14. Global Approval Gate (applies to every command)

**Default mode: APPROVAL REQUIRED.**

No source code changes. No configuration changes. No database changes.
No generated scripts. No write-capable MCP operations.
Until explicit user approval is received.

Optional override: include `auto=true` in arguments. Examples:

```text
/bug-fix auto=true
/new-development auto=true
/migration auto=true
```

**After Phase 1 – Discovery & Analysis, STOP and output §12 analysis blocks, then ask:**

```text
Approve implementation? (approve / yes / proceed / implement)
```

Only after one of those responses: proceed to the Execution Phase.
If `auto=true` was set: skip the gate, proceed directly to execution.

Allowed approval responses: `approve` · `yes` · `proceed` · `implement`

## 15. Migration Intelligence

**Externalized (F11 — Phase F lazy refactor).**
When executing `/migration`, Read `shared/commands/migration-intelligence.md` for the full
§15 specification (15a Discovery · 15b mode=exact · 15c mode=functionality · 15d Search limits · 15e Migration approval gate).
Do NOT load this section for non-migration commands.

## 16. Prompt Quality Assessment

**Externalized (F11 — Phase F lazy refactor).**
For every command, Read `shared/prompts/prompt-quality.md` for the full §16 specification
(16a Scoring factors · 16b Score bands · 16c Per-task output · 16d Session rollup · 16e Token correlation · 16f Rules).
Load once per session; reuse. Do NOT embed inline.

## 17. Pause-Turn Cap (G16 — Phase E)

Within a single approved command turn, the AI must pause and check in with the engineer
when either of these thresholds is reached:

- **File change threshold:** ≥ 10 file writes or edits in a single turn.
- **Layer expansion:** the task requires touching a layer not in the original scope
  (e.g. a bug-fix that discovers it also requires a DB migration; a UI change that
  requires a new API endpoint).

**Pause block format:**
```text
## Pause — Turn Cap Reached
Reason          : <file-change-threshold | layer-expansion>
Files changed   : N
New layer found : <layer name, if layer-expansion>
Remaining work  : <brief description of what is left>
Continue? (approve / yes / proceed / stop)
```

**Behaviour after pause:**
- If the engineer responds with an approval phrase: continue from where paused.
- If the engineer responds `stop` or does not respond: emit the Execution Summary (§13)
  for the work completed so far and end the turn.
- The pause block is NOT emitted if `auto=true` was set AND the risk level is LOW or MEDIUM.
- The pause block IS always emitted for HIGH or CRITICAL risk regardless of `auto=true`.

**Why this rule exists:**
Long autonomous turns reduce engineer oversight. The pause-turn cap ensures the engineer
remains in the loop at natural decision points during large changes.
