---
description: Execute a task Markdown file (plan, spec, or ticket) as an autonomous AI Developer Agent. Single Agent Mode by default; opt into Multi-Agent Mode with `multi`. Approval required before any change. Use auto=true to skip gate.
argument-hint: "[multi] file=<path.md>[,<path2.md>] | context [auto=true]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__gitlab-reader__get_file_contents, mcp__gitlab-reader__get_repository_tree
---

# Command: /dev

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **AI Developer Agent**. Input: `$ARGUMENTS`.

Executes a supplied task Markdown file (a plan, spec, or ticket write-up — e.g. `PLAN.md`) end
to end: read it, read only the context it points to, build an execution plan, implement,
validate, and report. `/dev` does not discover its own task — the task file (or `context`
folder contents) is always the primary instruction document.

---

## Mode Detection

A **mode word** is a *bare* token in `$ARGUMENTS` — one that is not `key=value` and is not the
literal shorthand `context`. `file=...`, `auto=true`, `redmine=...`, `context`, etc. are never
mode words, regardless of position. Find the first bare token, if any, and classify it:

| Mode word found | Mode |
| --- | --- |
| None (no bare token at all — e.g. `/dev file=PLAN.md`, `/dev context`, `/dev`) | **Single Agent Mode** (default) |
| `multi` | **Multi-Agent Mode** |
| Anything else (e.g. `/dev duo file=PLAN.md`) | **Invalid mode** — see below |

Parse `auto=true` from arguments anywhere. Store as session flag — applies for the rest of this
task's execution.

**Invalid mode:** if a bare token is present and it is not `multi`, stop and output:

```text
Invalid /dev mode: "<word>"
Valid modes:
  (default)  Single Agent
  multi      Multi-Agent
```

Do not proceed until re-invoked with a valid mode.

---

### Single Agent Mode (default)

- Execute as one agent. **Strictly do not create or use sub-agents** — this overrides contract
  C4's opt-in `agents=N` mechanism; `/dev` in default mode never spawns subagents regardless.
- Perform planning, implementation, testing, validation, and reporting yourself, sequentially.
- Never delegate work.

### Multi-Agent Mode (`multi`)

- This is contract C4's opt-in subagent allowance, scoped to this command: sub-agents **may**
  be created, capped at **3**, only when they provide clear value (e.g. independent,
  non-overlapping parts of the task file that can validate in parallel).
- Creating sub-agents is optional, not mandatory — if the task is small enough for one agent to
  do efficiently, do not create any.
- You (the parent agent) remain responsible for: planning, task distribution, coordination,
  conflict resolution, validation, and the final execution report. Sub-agents never report
  directly to the user and never self-approve — only you request approval and finalize.

---

## Input Resolution

| Input | Action |
| --- | --- |
| `file=<path.md>` (single) | `Read` the file — this is the task document (e.g. `PLAN.md`) |
| `file=<path1.md>,<path2.md>` | `Read` each in the order given; treat as one combined task document |
| `context` or `file=context` | Contract §1 `context` shorthand: resolve the external folder via `context/context.path`, `Glob` it, `Read` every file (md/txt/html/images) found in one pass |
| No `file=` and no `context` | Ask exactly one clarifying question: which task file to run |

Task files may point at more task material by relative reference — a Redmine ID, an MR, a
commit — resolve those the same way the other commands do (contract §2 deterministic
discovery) rather than re-deriving a separate mechanism here.

---

## Context Folder (repo-local, task-referenced)

Distinct from the `context` shorthand above: a repo may also contain a `context/` directory
used as reusable project knowledge (architecture, standards, existing plans, business rules,
API/DB docs).

- Only load files from `context/` that the task Markdown file **explicitly references**
  (e.g. a `## Context` section listing `context/architecture.md`).
- If the task file references nothing under `context/`, do not read the directory at all —
  never enumerate it speculatively (contract §3b no-scan rule).
- Treat referenced context files as authoritative for implementation guidance.

---

## Phase 1 — Discovery & Analysis (read-only, no changes)

1. Resolve the task file(s) via **Input Resolution**.
2. Read only the `context/` files the task file explicitly references (see above).
3. Standards (lazy): detect languages/layers the task touches, read matching
   `shared/standards/` files only. Skip if already cached this session.
4. **Knowledge graph first (kernel F-KG):** if the task file names a
   feature/flow/component but not exact file paths, and a `knowledge-graph`
   MCP server is connected, resolve it via `search_knowledge`/`get_context_pack`
   before falling back to a repository scan.
5. Build the execution plan: sequence of tasks, in the order they must run, with the layers
   each touches.

Output the analysis blocks (contract §12):

```text
## ROOT CAUSE / REQUIREMENT
<what the task file asks for, summarized>

## IMPACT ANALYSIS
Affected Areas: UI · Backend · Database · Integrations · APIs · Reports
Risk Level: Low / Medium / High

## IMPLEMENTATION BREAKDOWN
PART N - <area>
  PHASE N.N - <topic>
    TASK N.N.N <description>

## CHANGE ESTIMATE
Files Read: N | Est. Files Modified: N | UI: N | Backend: N | DB Objects: N
Complexity: Small / Medium / Large / XLarge
Mode: Single Agent | Multi-Agent (max 3 sub-agents)
```

**No code changes. No file writes. No MCP write operations in this phase.**

---

## Approval Gate (contract §14)

If `auto=true` was set: skip and proceed to Execution Phase.

Otherwise: STOP. Output the analysis blocks above and ask:

```text
Approve implementation? (approve / yes / proceed / implement)
```

Wait for approval. User may approve all parts or specify a subset:
`approve part 1` · `approve phase 1.1` — execute only the specified scope.

---

## Execution Phase (after approval or auto=true)

1. Implement each TASK in the approved scope, in sequence (Single Agent) or via the parent/
   sub-agent split decided in Phase 1 (Multi-Agent — see Multi-Agent Mode above).
2. Validate each completed TASK before moving to the next:
   - Completeness (contract §7): every applicable layer for that task is present.
   - Regression (contract §8): nothing already working is broken.
3. Run builds and tests where applicable to the stack touched.
4. Retry a simple, isolated failure automatically — maximum 3 attempts — then stop and report
   if still failing; do not silently skip a failed task.
5. Git stays read-only per contract §2 / GOVERNANCE.md §2: never commit, push, merge, create a
   PR, or rewrite history unless the user explicitly instructs it in this session.

---

## Output

Requirement analysis · implementation (per approved Parts/Phases) · validation (§7 + §8) ·
final execution report · audit line · Execution Summary (contract §13).
Budget: ≤ 40 files, ≤ 40k tokens per task file. Multi-Agent Mode: ≤ 3 sub-agents.
