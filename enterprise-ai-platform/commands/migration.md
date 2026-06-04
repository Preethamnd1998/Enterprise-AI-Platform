---
description: Migrate code between branches from a Redmine/MR/commit/branch/release or document file. Approval required before patching. mode=exact (smallest diff) or mode=functionality (full capability). Use auto=true to skip gate.
argument-hint: "mode=exact|functionality (mr=!N | commit=SHA | branch=B | release=vX..vY | redmine=ID | file=<path.md>) target=<branch> [auto=true]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__gitlab-reader__get_merge_request, mcp__gitlab-reader__get_merge_request_diffs, mcp__gitlab-reader__list_merge_request_changed_files, mcp__gitlab-reader__get_merge_request_file_diff, mcp__gitlab-reader__get_commit, mcp__gitlab-reader__get_commit_diff, mcp__gitlab-reader__get_branch_diffs, mcp__gitlab-reader__list_commits, mcp__gitlab-reader__get_file_contents
---

# Command: /migration

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Migration**. Input: `$ARGUMENTS`.

---

## Mode Detection

Parse `auto=true` from arguments. Store as session flag — applies to all tasks this session.

**If `$ARGUMENTS` is empty → Session Mode.**
**If `$ARGUMENTS` is non-empty → Direct Mode** (skip to Input Resolution below).

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
Migration Session started.  Skill loaded once.

Provide mode + source + target for each migration:
  • mode=exact   mr=!247        target=release/v2.5
  • mode=exact   commit=a3f9c12  target=hotfix/v2.4.1
  • mode=functionality  branch=feature/bulk-discharge  target=main
  • mode=functionality  redmine=41800  target=main
  • mode=exact   file=notes.md  target=release/v2.5

Options:
  • auto=true    — skip approval gate for this session

If mode is missing I will suggest one.  Type 'done' to end.
```

For each migration the user provides in this session:

1. Run **Input Resolution**, then **Phase 1 — Discovery & Analysis**.
2. Run **Approval Gate** (skip if `auto=true`).
3. After approval: run **Execution Phase**.
4. Append **Execution Summary** (contract §13).
5. Print: `─── Migration complete. Next? (or 'done') ───`
6. Wait for the next input. Repeat until user types `done`.
7. When user types `done`: print **Session Summary** (contract §13) and close.

**Token discipline:** Standards already read this session are NOT re-read.

---

## Input Resolution

| Input | Action |
| --- | --- |
| `mr=!<n>` | `list_merge_request_changed_files` + `get_merge_request_diffs` |
| `commit=<sha>` | `get_commit_diff` (union + dedupe if multiple) |
| `branch=<b>` | `get_branch_diffs` against merge-base of `target` |
| `release=vX..vY` | `list_commits` over tag range → aggregate paths → diff at endpoints |
| `redmine=<id>` | `redmine_get_issue` → parse body for `!<n>` (MR) or SHA → follow to MR/commit |
| `file=<path>` (.md / .txt) | `Read` the file — extract MR numbers, SHAs, branch names, change descriptions |
| `file=<path>` (.doc / .docx) | Cannot read binary — ask user to export as `.md` or `.txt` |

If `mode` is missing: suggest `exact` for cherry-pick/hotfix/backport, `functionality` for feature ports.
If `target` is missing: ask before proceeding.

---

## Phase 1 — Discovery & Analysis (read-only, no changes)

1. Resolve input via **Input Resolution**. Produce CHANGE SET: `{ files[], hunks[], symbolsTouched[] }`.
2. Diff semantic filter: drop whitespace-only, comment-only, brace/format-only, import-reorder hunks. Keep `functionalHunks[]` + `symbolsTouched[]`.
3. Standards (lazy): Read `migration/semantic-git.md`, `migration/cherry-pick-rules.md`, backend/frontend standards for affected layers. Skip if cached.
4. For `mode=exact`: check compile-gap symbols on `target`. For `mode=functionality`: map capability closure against module boundary.
5. Detect signature drift between source and `target`.

Output analysis blocks (contract §12):

```text
## ROOT CAUSE / REQUIREMENT
Source: <mr/commit/branch>  →  Target: <branch>  |  Mode: exact / functionality

## IMPACT ANALYSIS
Affected Areas: <layers touched>
Risk Level: Low / Medium / High
Signature drift detected: Yes / No

## IMPLEMENTATION BREAKDOWN
PART 1 - MIGRATION PATCH
  PHASE 1.1 - Functional Hunks
    TASK 1.1.N <file> — <change description>
  PHASE 1.2 - Compile-gap Symbols (exact) / Capability Closure (functionality)
    TASK 1.2.N <symbol> — add / skip

## CHANGE ESTIMATE
Files Read: N | Est. Files Modified: N | UI: N | Backend: N | DB Objects: N
Complexity: Small / Medium / Large / XLarge
```

**No code changes. No file writes in this phase.**

---

## Approval Gate (contract §14)

If `auto=true` was set: skip and proceed to Execution Phase.

Otherwise: STOP. Output analysis blocks and ask:

```text
Approve implementation? (approve / yes / proceed / implement)
```

---

## Execution Phase (after approval or auto=true)

### mode=exact

1. Take `functionalHunks` only.
2. Compile-gap: pull missing symbols (depth-1). Never expand for relatedness.
3. Produce the smallest patch. Warn on signature drift.

### mode=functionality

1. Seed = `symbolsTouched`. Bounded capability closure via typed references + naming conventions.
2. Delta vs target: skip identical/compatible files. Migrate only MISSING or DIVERGENT.
3. Apply changes to local working branch.

Validation: completeness §7 (applicable) · regression §8 · changed files ⊆ {functional hunks ∪ compile-deps}.
Stop: patch applies AND every referenced symbol resolves on target. Report gaps — never silent truncate.

---

## Output

Change set · mode · migration plan · migrated code · validation (§7 + §8) · audit line · Execution Summary (contract §13).
Budget: `mode=exact` ≤ 15 files · ≤ 12k tokens. `mode=functionality` ≤ 40 files · ≤ 40k tokens.
