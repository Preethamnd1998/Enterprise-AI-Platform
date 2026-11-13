<!-- SHARED CONTRACT v3
     Claude Code (global):  installed to ~/.claude/CLAUDE.md by install-claude.ps1
     Copilot (per-repo):    vendored to .github/ai-platform/shared/contract.md by install-copilot.ps1
     Keep this file STABLE — it is the prompt-cache prefix for every session.
     KERNEL section (~30 lines) is injected verbatim by the installer.
     Full contract (§0–§17) is the reference source; commands lazy-load task-class sections.
     Phase F (v4.3) will inline all task-class sections into commands; kernel stays lean. -->

<!-- enterprise-ai-platform:kernel:start -->
# EAP Execution Contract (kernel)

Single reasoning agent; no sub-agents unless `agents=N` (max 3). Plugin root `{{EAP_ROOT}}` — bundle `ai-platform/` (contract.md §0–§18, standards, rules, knowledge, templates), tools `bin/`. Everything below the kernel is read ON DEMAND: only the section, standard, rule or knowledge file the current step cites.

1. Analyze only what the task requires; never bulk-load or scan the repository. Deterministic discovery: resolve the exact change set from Redmine / MR / commit / branch.
2. Hunks not files; signatures not bodies for unchanged neighbours; depth-1 dependency expansion only. A file enters scope only if it is in the change set, something loaded references it, or naming convention ties it to a loaded symbol.
3. Prove completeness AND no regression before "done" (contract §7–§8).

**Graph first:** before any Grep/Glob over source for a flow, endpoint, dependency, DB impact or symbol usage, use `unified-trace` (`saga`, `trace`, `trace_usages`, `trace_impact`, `index_status`); for a cheap overview use `knowledge-graph` `get_context_pack(topic, max_tokens≤1500)`. Results are an index: Read only the cited file:line ranges, keep VERIFIED/INFERRED/UNRESOLVED tags. Scoped scan only when the graph is unavailable or unresolved.

**Context discipline:** never re-read a file or re-run a search already summarised; drop raw payloads. Builds, tests, log tails, long git output → `{{EAP_ROOT}}/bin/eap-run <cmd>` (else `| tail -n 80`). Budget 150k (`CTX_BUDGET`): when the meter warns, refresh `<project>/.claude/checkpoints/current.md` (agent-state section ≤40 lines) and `/compact`; after resume/compaction Read that checkpoint first. SKILL.md is an index — open `references/` only for the mode needed.

**Lazy loading:** `ai-platform/standards/coding-standards.md` is mandatory for any code change, then standards by language/layer; `rules/` by task type; `knowledge/` via `company-profile.md`'s topic table; tests → `standards/testing/README.md` first.

**Gates:** auto by default — output the §12 analysis blocks, then execute. STOP for approval only when §9 risk is High/Critical (DB/Flyway, permissions, auth/security, billing/financial/patient data, application scope), when `auto=false`, or for approval-only steps (data-correction scripts are never executed). MCP is read-only by allowlist.

**Arguments:** `key=value` — `redmine`, `mr`, `commit`, `branch`, `release`, `target`, `component`, `mode`, `agents`, `auto`. One clarifying question if a required key is missing, then proceed.
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

1. Resolve the folder path in this order: `CONTEXT_PATH` from `paths.env` (repo root) if set to a non-blank value → else `Read context/context.path`, first non-empty non-comment line → else fall back to `context/` inside the repo.
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
- Java / Spring   → `<root>/backend/<layer>.md` (only layers touched: controller, service, repository, entity, dto-mapper-enum, common-api, spring, custom-annotations, sql-query, db-migration)
- Angular / TS    → `<root>/frontend/<topic>.md` (only topics touched: component, service, custom-components, pagination, others, angular, app-shell-menu-config-cache, global-filter-search, modern-clinical-enterprise-design-system)
- Flutter / Dart  → `<root>/mobile/<topic>.md` (only topics touched: widget, service, state-management, routing, models, flutter) — detect via `pubspec.yaml`, `*.dart` files, or `lib/`/`test/` Flutter project layout
- SQL / Flyway    → `<root>/backend/repository.md` + `<root>/migration/` DB sections
- Migration task  → `<root>/migration/semantic-git.md`, `<root>/migration/cherry-pick-rules.md`
- Writing/reviewing tests → `<root>/testing/README.md` first (index, points to the
  matching topic file(s) — e.g. `testing/java-junit-mockito.md`, `testing/angular-testing.md`,
  `testing/test-case-design.md`). This knowledge base **supplements, never overrides**,
  `<root>/testing.md` (the `/test` command's machine-enforced automation contract) and
  `<root>/rules/testing.md` — read only the topic file(s) the task actually touches.
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

## 6. Context & output discipline
Send changed hunks (full) and neighbor SIGNATURES (not bodies). Discard raw MCP payloads after
extracting facts; keep short summaries. Never re-read a file already summarized this session.
Ignore: node_modules, dist, build, target, coverage, logs, generated/binary/vendor files.

**6a. Terminal/command output discipline**
Before carrying raw command output into context or a response, keep everything load-bearing —
exit codes, error messages, stack traces (root cause + the outer frame; trim repetitive middle
frames), failing test names/assertions, compiler/lint errors, and diffs relevant to the task.
Drop or collapse: progress bars/spinners, repeated identical log lines (collapse to one line + a
count), build-tool banners, and successful/no-op lines once the task only needs the failure.
Never report a FAILURE as a PASS, never drop the only occurrence of an error, and never change
what an exit code implies when summarizing it. When unsure whether a line matters, keep it.

**6b. Response conciseness**
Default to the shortest response that fully answers the question: lead with the result, then add
only the reasoning, caveats, or file:line references the user needs to act on it. Do not restate
the task, narrate routine steps, or append a closing summary after output that already states the
result. Keep: the answer itself, code, exact error text, file:line references, and any caveat that
changes what the user should do next. Drop: filler acknowledgements, restating the request, and
saying the same point more than once. This does not relax §12/§13's mandatory structured blocks —
those are emitted verbatim; conciseness governs the prose around them. If the user asks for a
detailed explanation, give one — conciseness is the default, not a ceiling.

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

**Default mode: AUTO.** After Phase 1 – Discovery & Analysis, output the §12 analysis blocks and proceed directly to the Execution Phase. Do not stop for a textual approval.

The gate re-engages — STOP, output the §12 blocks and ask — only when:
- the §9 risk gate classifies the change as High/Critical, or
- `auto=false` is passed in the arguments, or
- the command's own instructions mark a step as approval-only (e.g. `/data-correction` scripts are shown, never executed).

```text
Approve implementation? (approve / yes / proceed / implement)
```

Allowed approval responses: `approve` · `yes` · `proceed` · `implement`

**Context checkpoint (F-CTX):** before any `/compact` or `/clear` on an unfinished task, refresh `<project>/.claude/checkpoints/current.md` (agent-state section, ≤40 lines). The ctx-meter hook keeps the structural part (files edited, tokens, prompts) up to date on every Stop.


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

## 17. (retired)

The pause-turn cap (G16) has been removed. There is no file-change or layer-expansion pause threshold;
the approval gate (§14) and the risk gate (§9) still apply.

## 18. Redmine Comment Templates (on-demand, never proactive)

Only when the engineer **explicitly asks** to add a comment to a Redmine issue
(execution/status update, or a plan-approval comment) — never as a default
step of any command:

- Status/execution update → Read `shared/templates/redmine-execution-comment.md`, follow it.
- Plan-approval comment (after the Plan Reviewer skill approves a plan) →
  Read `shared/templates/redmine-approval-comment.md`, follow it.

Both templates enforce the same discipline: short (≤~6 lines), reference
files by name for anything long (plan, test-case report), never paste file
contents into the comment body, never claim a check that wasn't actually run.
