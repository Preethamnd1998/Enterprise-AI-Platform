---
description: Design and implement new features or large functionalities from a Redmine story, user story, document, or screenshot. Approval required before implementation. Use auto=true to skip gate.
argument-hint: "redmine=<id> | file=<path.md> | \"<feature requirement / user story>\" [auto=true]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__redmine-reader__redmine_get_project, mcp__redmine-reader__redmine_get_wiki_page, mcp__gitlab-reader__search_repositories, mcp__gitlab-reader__get_repository_tree, mcp__gitlab-reader__get_file_contents
---

# Command: /new-development

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **New Development**. Input: `$ARGUMENTS`.

---

## Mode Detection

Parse `auto=true` from arguments. Store as session flag â€” applies to all tasks this session.

**If `$ARGUMENTS` is empty â†’ Session Mode.**
**If `$ARGUMENTS` is non-empty â†’ Direct Mode** (skip to Input Resolution below).

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
New Development Session started.  Skill loaded once.

Describe your feature using any of:
  â€¢ redmine=<id>              â€” Redmine story or epic (fetched automatically)
  â€¢ Free text                 â€” "Add bulk discharge for inpatient"
  â€¢ Paste a user story        â€” As a doctor, I want to...
  â€¢ file=<path>               â€” .md / .txt / .html requirements document
  â€¢ context                   â€” scan context/ folder (any filenames)
  â€¢ Attach a screenshot       â€” UI mockup or wireframe

Options:
  â€¢ auto=true                 â€” skip approval gate for this session

Type 'done' to end the session.
```

For each feature the user provides in this session:

1. Run **Input Resolution**, then **Phase 1 â€” Discovery & Analysis**.
2. Run **Approval Gate** (skip if `auto=true`).
3. After approval: run **Execution Phase**.
4. Append **Execution Summary** (contract Â§13).
5. Print: `â”€â”€â”€ Feature complete. Next? (or 'done') â”€â”€â”€`
6. Wait for the next input. Repeat until user types `done`.
7. When user types `done`: print **Session Summary** (contract Â§13) and close.

**Token discipline:** Standards and analog files already loaded this session are NOT re-read.

---

## Input Resolution

| Input | Action |
| --- | --- |
| `redmine=<id>` | `redmine_get_issue` â†’ extract story, acceptance criteria, linked wiki/project |
| Free text / user story | Extract feature name, actors, expected behaviour |
| `file=<path>` (.md / .txt / .html) | `Read` the file â€” treat as requirements document |
| `file=<path>` (.doc / .docx) | Cannot read binary â€” ask user to export as `.md` or `.txt` |
| `context` or `file=context` | `Glob context/**` â†’ `Read` all files found â€” use as full input context |
| Screenshot / wireframe | Read as image â€” treat as visual spec |

---

## Phase 1 â€” Discovery & Analysis (read-only, no changes)

A feature is not in the repo yet â€” discover the **insertion point** (the nearest existing
analog feature to extend), not "the feature". Read structure/signatures, never implementations.

1. Resolve requirements via **Input Resolution** above. Fetch project/wiki if linked.
2. ONE `search_repositories` for the closest existing analog capability.
   Get file list + signatures via `get_repository_tree` (single module, shallow) + `get_file_contents` (signatures only).
3. Standards (lazy): Read `coding-standards.md` + standards for layers the feature will touch. Skip if cached.
4. Enumerate every layer to create/modify. Build the PARTS â†’ PHASES â†’ TASKS breakdown.

Output the analysis blocks (contract Â§12):

```text
## ROOT CAUSE / REQUIREMENT
<what needs to be built and why>

## IMPACT ANALYSIS
Affected Areas: UI Â· Backend Â· Database Â· Integrations Â· APIs Â· Reports
Risk Level: Low / Medium / High

## IMPLEMENTATION BREAKDOWN
PART 1 - BACKEND
  PHASE 1.1 - <layer>
    TASK 1.1.1 <description>
    TASK 1.1.2 <description>
  PHASE 1.2 - <layer>
    TASK 1.2.1 <description>

PART 2 - UI
  PHASE 2.1 - <components>
    TASK 2.1.1 <description>
  PHASE 2.2 - <validation>
    TASK 2.2.1 <description>

## CHANGE ESTIMATE
Files Read: N | Est. Files Modified: N | UI: N | Backend: N | DB Objects: N
Complexity: Small / Medium / Large / XLarge
```

**No code changes. No file writes. No MCP write operations in this phase.**

---

## Approval Gate (contract Â§14)

If `auto=true` was set: skip and proceed to Execution Phase.

Otherwise: STOP. Output the analysis blocks above and ask:

```text
Approve implementation? (approve / yes / proceed / implement)
```

Wait for approval. User may approve all parts or specify a subset:
`approve part 1` Â· `approve phase 1.1` â€” execute only the specified scope.

---

## Execution Phase (after approval or auto=true)

Execute only the approved Parts/Phases in order.

1. Implement each TASK in sequence within the approved scope.
2. Reuse existing patterns â€” design by analogy, not invention.
3. Validation at each Part completion:
   - Completeness (contract Â§7): every layer of the approved scope covered.
   - Regression (contract Â§8): nothing already working is broken.

---

## Output

Requirement analysis Â· implementation (per approved Parts/Phases) Â· validation (Â§7 + Â§8) Â· audit line Â· Execution Summary (contract Â§13).
Budget: 3â€“5 structure files in Phase 1 Â· â‰¤ 40 files total Â· â‰¤ 40k tokens per feature.

