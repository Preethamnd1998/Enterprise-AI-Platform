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

Migration is **semantic, not a file-copy operation.** Understand intent before comparing code.

**15a. Discovery (before any migration)** — identify and document:

- Business requirement and functional behavior
- API changes (signatures, status codes, contracts)
- Data model changes (schema, constraints, indexes)
- Validation, security, and authorization changes
- Feature flags and configuration changes

Build semantic understanding first. Do not compare files line-by-line before understanding intent.

**15b. mode=exact** — goal: smallest possible patch.
Rules: no redesign · no refactor · no optimization · no cleanup.
Only migrate what is required. Call out scope creep explicitly; never silently absorb it.

**15c. mode=functionality** — goal: preserve behavior, not code.
Determine source behavior + target architecture → produce behavior-preserving implementation.
Identical code is not required. Structural differences are expected.

**15d. Search limits**
Scope: source branch · target branch · directly related MRs · directly related Redmine tickets.
Do not scan unrelated repositories or unrelated services.

**15e. Migration approval gate** — before implementation, stop and output:

```text
MIGRATION ANALYSIS
Business Objective:  <summary>
Affected Parts:      <list>
Affected Phases:     <list>
Affected Tasks:      <list>
Risk Analysis:       Low / Medium / High
Migration Strategy:  exact / functionality
Est. Files:          N
Est. Complexity:     Small / Medium / Large / XLarge
```

STOP. Wait for approval.

## 16. Prompt Quality Assessment

Evaluate every user request and append a `Prompt Quality` line to the §13 Execution Summary.
**Purpose:** measure how much discovery work the platform had to perform — not user skill.
A low score means more tokens were consumed on investigation that better input could have avoided.

### 16a. Scoring factors

Positive signals (raise score): exact identifier (Redmine ID / MR / branch / commit / table /
collection) · error evidence (stack trace / logs / screenshot / SQL error) · business context
(expected vs actual behavior) · scope definition (module / component / service / API) ·
reproduction steps · design reference.

Negative signals (lower score): missing issue details · missing scope · missing expected behavior ·
ambiguous request · multiple unrelated objectives · repository-wide instruction
("search all", "analyze everything", "find the issue").

### 16b. Score bands

| Score | Label | Discovery impact |
| ----- | ----- | ---------------- |
| 90–100 | Excellent | Minimal discovery required |
| 70–89 | Good | Minor discovery required |
| 50–69 | Moderate | Several assumptions needed |
| 30–49 | Poor | Large discovery effort required |
| 0–29 | Very Poor | Scope unclear — significant investigation required |

### 16c. Per-task output — included in §13 Execution Summary

```text
Prompt Quality: 86/100 (Good)
Strengths:     Redmine ID · exact module · stack trace
Missing:       Expected behavior
Token impact:  Minor — one assumption needed
```

### 16d. Session rollup — included in §13 Session Summary

```text
Avg Prompt Quality: 74/100
High: 92  Low: 45
Most missing: stack trace · expected behavior
```

### 16e. Token correlation

Report `Prompt Quality` alongside `Estimated Tokens` — this shows engineers which missing inputs drove cost.
Example: Quality 92 → ~3k tokens · Quality 35 → ~18k tokens.

### 16f. Rules

- Never shame or criticize. Never block execution. Score is informational only.
- Execution always continues regardless of score.
- Goal: better prompts → lower token usage → faster execution → less discovery effort.
