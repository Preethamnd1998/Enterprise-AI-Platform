---
description: Turn a Redmine story/epic into an impact analysis, technical design, task breakdown, and test strategy. Reads structure, not implementations.
argument-hint: "redmine=<id> | \"<feature requirement>\""
allowed-tools: Read, Grep, Glob, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__redmine-reader__redmine_get_project, mcp__redmine-reader__redmine_get_wiki_page, mcp__gitlab-reader__search_repositories, mcp__gitlab-reader__get_repository_tree, mcp__gitlab-reader__get_file_contents
---

# Command: /planning
<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Planning / Feature**. Input: `$ARGUMENTS`.

## Specialization
A feature is not in the repo yet — discover the **insertion point** (the nearest existing
analog feature to extend), not "the feature". Read structure/signatures, never implementations.

## Workflow
1. **Requirements.** If `redmine=<id>`, `redmine_get_issue` (+ project/wiki only if linked).
2. **Find the analog.** ONE `search_repositories` for the closest existing capability
   (e.g. "Refund" when planning "PartialRefund"). Get its file list + signatures via
   `get_repository_tree` (single module, shallow) + `get_file_contents` (signatures only).
3. **Standards (lazy).** Read `coding-standards.md` + the standards for the layers the feature will touch.
4. **Design by analogy.** Enumerate every layer to create/modify; reuse existing patterns; do not invent new architecture.
5. **Test strategy.** Unit / integration / regression coverage for the new capability.

## Validation
Plan-completeness: every layer covered (controller · service · repository · DTO · mapper ·
entity · validation · SQL/Flyway · Angular · route · permission · translation · tests).
No code is produced in planning.

## Output
Requirement analysis · impact analysis · technical design · task breakdown · test strategy · audit line.
Budget: 3–5 files (structure only), ≤ 10k tokens, target < 5s.
