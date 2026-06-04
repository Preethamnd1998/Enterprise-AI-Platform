---
description: Root-cause and fix a defect from a Redmine ID, stack trace, or error log. Trace-driven, minimal-diff, no repo scan.
argument-hint: "redmine=<id> | \"<stack trace / error>\"  [component=<name>]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__gitlab-reader__get_file_contents, mcp__gitlab-reader__get_file_blame, mcp__gitlab-reader__get_commit, mcp__gitlab-reader__get_commit_diff, mcp__chrome-devtools-mcp__take_snapshot, mcp__chrome-devtools-mcp__take_screenshot, mcp__chrome-devtools-mcp__list_console_messages
---

# Command: /bug-fix
<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Bug Fix**. Input: `$ARGUMENTS`.

## Specialization
The stack trace IS the dependency map — parse it, do not search the repository.

## Workflow
1. **Discovery.** If `redmine=<id>`, `redmine_get_issue` and extract the stack trace / steps.
   Parse the trace; keep only OWN-package frames (skip `java.*`, `javax.*`, `org.springframework.*`, `node_modules`).
2. **Locate.** `get_file_contents` for the own-package frames (≤ 3). `get_file_blame` on the
   failing line to find the regression commit.
3. **Standards (lazy).** Read only the standard for the failing layer/language (e.g. `backend/service.md` or `frontend/component.md`) + `coding-standards.md`.
4. **Root cause.** Stop at confidence > 90%. Expand depth-1 only to the symbol the failing line calls.
5. **Fix.** Smallest possible diff. Preserve APIs, validations, workflows, permissions.
6. **UI bugs only.** If the trace indicates a render/console error, use chrome read-only tools to confirm; otherwise do not.

## Validation
- Completeness (contract §7, applicable items).
- Regression (contract §8): existing behavior of the touched flow still works.
- Assert: changed files ⊆ the frames + depth-1 symbol. No unrelated edits.

## Output
Root cause · affected files · fix plan · diff · completeness+regression result · audit line.
Budget: ≤ 10 files, ≤ 6k tokens.
