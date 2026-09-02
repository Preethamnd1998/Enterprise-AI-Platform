---
description: Root-cause and fix a defect from a Redmine ID, stack trace, error log, screenshot, user story, or document file. Approval required before any change. Use auto=true to skip gate.
argument-hint: "redmine=<id> | mr=!<n> | commit=<sha> | file=<path.md> | \"<stack trace>\" [auto=true]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__gitlab-reader__get_file_contents, mcp__gitlab-reader__get_file_blame, mcp__gitlab-reader__get_commit, mcp__gitlab-reader__get_commit_diff, mcp__chrome-devtools-mcp__take_snapshot, mcp__chrome-devtools-mcp__take_screenshot, mcp__chrome-devtools-mcp__list_console_messages
---

# Command: /bug-fix

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Bug Fix**. Input: `$ARGUMENTS`.

---

## Mode Detection

Parse `auto=true` from arguments. Store as session flag â€” applies to all tasks this session.

**If `$ARGUMENTS` is empty â†’ Session Mode.**
**If `$ARGUMENTS` is non-empty â†’ Direct Mode** (skip to Input Resolution below).

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
Bug Fix Session started.  Skill loaded once.

Describe your bug using any of:
  â€¢ redmine=<id>              â€” Redmine issue (fetched automatically)
  â€¢ mr=!<n> or commit=<sha>   â€” GitLab MR or commit
  â€¢ Paste a stack trace / error log
  â€¢ Paste a user story / bug description
  â€¢ file=<path>               â€” .md / .txt / .html file with bug details
  â€¢ context                   â€” scan context/ folder (any filenames)
  â€¢ Attach a screenshot       â€” error UI or console snapshot

Options:
  â€¢ auto=true                 â€” skip approval gate for this session

Type 'done' to end the session.
```

For each bug the user provides in this session:

1. Run **Input Resolution**, then **Phase 1 â€” Discovery & Analysis**.
2. Run **Approval Gate** (skip if `auto=true`).
3. After approval: run **Execution Phase**.
4. Append **Execution Summary** (contract Â§13).
5. Print: `â”€â”€â”€ Fix complete. Next bug? (or 'done') â”€â”€â”€`
6. Wait for the next input. Repeat until user types `done`.
7. When user types `done`: print **Session Summary** (contract Â§13) and close.

**Token discipline:** Standards already read this session are NOT re-read. Reuse file summaries from prior bugs.

---

## Input Resolution

| Input | Action |
| --- | --- |
| `redmine=<id>` | `redmine_get_issue` â†’ extract description, stack trace, steps to reproduce |
| `mr=!<n>` | `get_merge_request` + `get_merge_request_diffs` |
| `commit=<sha>` | `get_commit_diff` |
| Pasted stack trace | Parse directly â€” keep OWN-package frames only |
| User story / free text | Treat as bug description â€” extract symptoms and affected area |
| `file=<path>` (.md / .txt / .html) | `Read` the file â€” use as bug description or trace |
| `file=<path>` (.doc / .docx) | Cannot read binary â€” ask user to export as `.md` or `.txt` |
| `context` or `file=context` | `Glob context/**` â†’ `Read` all files found â€” use as full input context |
| Screenshot attached | Read as image â€” visual error context |

---

## Phase 1 â€” Discovery & Analysis (read-only, no changes)

1. Resolve input via **Input Resolution** above.
2. Identify OWN-package frames from the trace/description.
3. `get_file_contents` for own-package frames (â‰¤ 3). `get_file_blame` on the failing line.
4. Standards (lazy): Read the standard for the failing layer + `coding-standards.md`. Skip if cached.
5. Determine root cause (confidence > 90%).
6. Identify depth-1 symbol the failing line calls.

Output the analysis blocks (contract Â§12):

```text
## ROOT CAUSE / REQUIREMENT
<what is broken and why>

## IMPACT ANALYSIS
Affected Areas: <UI / Backend / Database / ...>
Risk Level: Low / Medium / High

## IMPLEMENTATION BREAKDOWN
PART 1 - <layer>
  PHASE 1.1 - Fix
    TASK 1.1.1 <description>

## CHANGE ESTIMATE
Files Read: N | Est. Files Modified: N | UI: N | Backend: N | DB Objects: 0
Complexity: Small / Medium / Large
```

**No code changes. No file writes. No MCP write operations in this phase.**

---

## Approval Gate (contract Â§14)

If `auto=true` was set: skip and proceed to Execution Phase.

Otherwise: STOP. Output the analysis blocks above and ask:

```text
Approve implementation? (approve / yes / proceed / implement)
```

Wait for approval before any changes.

---

## Execution Phase (after approval or auto=true)

1. Apply the fix â€” smallest possible diff. Preserve APIs, validations, workflows, permissions.
2. UI bugs only: if trace/screenshot indicates a render/console error, use chrome read-only tools to confirm before fixing.
3. Validation:
   - Completeness (contract Â§7, applicable items).
   - Regression (contract Â§8): existing behavior of the touched flow still works.
   - Assert: changed files âŠ† frames + depth-1 symbol. No unrelated edits.

---

## Output

Root cause Â· fix Â· validation (Â§7 + Â§8) Â· audit line Â· Execution Summary (contract Â§13).
Budget: â‰¤ 10 files, â‰¤ 6k tokens per bug.

