---
description: Turn a Redmine story, bug report, or free-text requirement into a PLAN.md and a TEST-CASES.xlsx — technical design, gap analysis, task breakdown, and QA test strategy. Approval required before file generation. Use auto=true to skip gate.
argument-hint: "redmine=<id> | file=<path.md> | \"<feature or bug requirement>\" [auto=true]"
allowed-tools: Read, Grep, Glob, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__redmine-reader__redmine_get_project, mcp__redmine-reader__redmine_get_wiki_page, mcp__gitlab-reader__search_repositories, mcp__gitlab-reader__get_repository_tree, mcp__gitlab-reader__get_file_contents, mcp__gitlab-reader__get_merge_request, mcp__gitlab-reader__get_merge_request_diffs
---

# Command: /planning

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Planning**. Input: `$ARGUMENTS`.

This is the standalone entry point to the platform's shared planning procedure
(`shared/commands/planning-engine.md`). Use it when you want a written
`PLAN.md` + `TEST-CASES.xlsx` pair *before* deciding which implementation
command (`/bug-fix`, `/new-development`, `/migration`, `/ui-design-update`,
`/data-correction`) to run — or when you just want the plan and nothing
executed yet. It never implements. It never scaffolds test code — that's
`/test`'s job; this command reuses `/test`'s detection instead of duplicating
it (see Test-Case Generation below).

---

## Mode Detection

Parse `auto=true` from arguments. Store as session flag — applies to all tasks
this session.

**If `$ARGUMENTS` is empty → Session Mode.**
**If `$ARGUMENTS` is non-empty → Direct Mode** (skip to Input Resolution below).

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
Planning Session started.  Skill loaded once.

Describe what needs planning using any of:
  • redmine=<id>              — Redmine story or bug (fetched automatically)
  • Free text                 — "Add bulk discharge for inpatient"
  • file=<path>                — .md / .txt / .html requirements document
  • context                   — scan context/ folder (any filenames)

Options:
  • auto=true                 — skip approval gate for this session

Type 'done' to end the session.
```

For each item the user provides in this session:

1. Run **Input Resolution**, then **Phase 1 — Discovery & Analysis**.
2. Run **Approval Gate** (skip if `auto=true`).
3. After approval: run **Generation Phase**.
4. Append **Execution Summary** (contract §13).
5. Print: `─── Plan complete. Next? (or 'done') ───`
6. Wait for the next input. Repeat until user types `done`.
7. When user types `done`: print **Session Summary** (contract §13) and close.

**Token discipline:** Standards and analog files already loaded this session
are NOT re-read.

---

## Input Resolution

| Input | Action |
| --- | --- |
| `redmine=<id>` | `redmine_get_issue` → extract story/bug, acceptance criteria, linked wiki/project, journals |
| Free text / user story | Extract requirement, actors, expected behaviour |
| `file=<path>` (.md / .txt / .html) | `Read` the file — treat as requirements document |
| `file=<path>` (.doc / .docx) | Cannot read binary — ask user to export as `.md` or `.txt` |
| `context` or `file=context` | `Glob context/**` → `Read` all files found — use as full input context |

---

## Phase 1 — Discovery & Analysis (read-only, no changes)

1. Resolve requirements via **Input Resolution** above.
2. ONE `search_repositories` for the closest existing analog/current implementation, if any.
   Signatures only, not bodies — same no-scan discipline as every other command.
3. Read `shared/commands/planning-engine.md` and run its Gap Analysis → Environment
   Reasoning → Impact Analysis → Breakdown → Change Estimate procedure with
   `domain=planning`, using step 1–2 above as the "current state" input.

Output the analysis blocks (contract §12) exactly as `planning-engine.md` produces them.

**No file writes. No MCP write operations in this phase.**

---

## Approval Gate (contract §14)

If `auto=true` was set: skip and proceed to Generation Phase.

Otherwise: STOP. Output the analysis blocks above and ask:

```text
Approve plan generation? (approve / yes / proceed / implement)
```

---

## Generation Phase (after approval or auto=true)

### 1 — `PLAN.md`

Render the Phase 1 analysis into this exact section shape (each row is a direct
re-render of a planning-engine.md output — no new invention):

```markdown
# Plan — <requirement title>

## Requirement Summary
<ROOT CAUSE / REQUIREMENT>

## Current Functionality
<planning-engine Step 1 output, or "None — greenfield">

## Gap Analysis
<planning-engine Step 2 output>

## Proposed Solution
<narrative summary of the IMPLEMENTATION BREAKDOWN>

## Files Likely to Change
<file list derived from the breakdown tasks>

## APIs Impacted
<from IMPACT ANALYSIS>

## Database Impact
<from IMPACT ANALYSIS — "None" if not applicable>

## UI Impact
<from IMPACT ANALYSIS — "None" if not applicable>

## Risks
<risk level + reasoning, per contract §9>

## Implementation Checklist
<the PART/PHASE/TASK tree, rendered as checkboxes>

## Acceptance Criteria
<derived from the requirement + gap analysis — one criterion per gap item>
```

Write to `PLAN.md` in: the user-specified path if one was given, else
`PLAN_OUTPUT_PATH` from `paths.env` (repo root) if it's set to a non-blank
value, else the current working directory (existing default).

### 2 — `TEST-CASES.xlsx`

Reuse `/test`'s Phase 1 (Stack Detection) and Phase 2 (Change Set Resolution)
logic against the files identified in "Files Likely to Change" above —
read-only, same as `/test` runs it. Do not scaffold test *code*; instead map
each identified gap/change to a QA test-case row:

| Column | Source |
|---|---|
| Test ID | sequential, `TC-001`, `TC-002`, ... |
| Module | from IMPACT ANALYSIS affected area |
| Feature | requirement title |
| Scenario | one gap-analysis delta per row, plus edge cases the delta implies |
| Preconditions | derived from Current Functionality |
| Test Steps | numbered, concrete |
| Expected Result | from Acceptance Criteria |
| Priority | High/Medium/Low, aligned to Risk Level |
| Severity | High/Medium/Low, aligned to Risk Level |
| Regression | Yes if the change touches existing behavior, No if purely additive |
| Automation Candidate | Yes if `/test`'s stack detection found a runnable test framework for the touched files, No otherwise |
| Remarks | anything the analysis flagged as an assumption or open question |

Generate the `.xlsx` via a short one-off script (`Bash` + an available
spreadsheet-writing library). **If no such library is available in this
environment, stop and report that explicitly — do not silently fall back to a
plain-text substitute and call it done.** Write to `TEST-CASES.xlsx` in: the
user-specified path if one was given, else `PLAN_OUTPUT_PATH` from
`paths.env` if set, else the current working directory (existing default) —
same resolution as `PLAN.md` above, so both land in the same place.

---

## Output

Requirement analysis · `PLAN.md` · `TEST-CASES.xlsx` · audit line · Execution
Summary (contract §13).
Budget: 5 structure files in Phase 1 · ≤ 10k tokens per plan.
