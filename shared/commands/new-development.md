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

Parse `auto=true` from arguments. Store as session flag — applies to all tasks this session.

**If `$ARGUMENTS` is empty → Session Mode.**
**If `$ARGUMENTS` is non-empty → Direct Mode** (skip to Input Resolution below).

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
New Development Session started.  Skill loaded once.

Describe your feature using any of:
  • redmine=<id>              — Redmine story or epic (fetched automatically)
  • Free text                 — "Add bulk discharge for inpatient"
  • Paste a user story        — As a doctor, I want to...
  • file=<path>               — .md / .txt / .html requirements document
  • context                   — scan context/ folder (any filenames)
  • Attach a screenshot       — UI mockup or wireframe

Options:
  • auto=true                 — skip approval gate for this session

Type 'done' to end the session.
```

For each feature the user provides in this session:

1. Run **Input Resolution**, then **Phase 1 — Discovery & Analysis**.
2. Run **Approval Gate** (skip if `auto=true`).
3. After approval: run **Execution Phase**.
4. Append **Execution Summary** (contract §13).
5. Print: `─── Feature complete. Next? (or 'done') ───`
6. Wait for the next input. Repeat until user types `done`.
7. When user types `done`: print **Session Summary** (contract §13) and close.

**Token discipline:** Standards and analog files already loaded this session are NOT re-read.

---

## Input Resolution

| Input | Action |
| --- | --- |
| `redmine=<id>` | `redmine_get_issue` → extract story, acceptance criteria, linked wiki/project |
| Free text / user story | Extract feature name, actors, expected behaviour |
| `file=<path>` (.md / .txt / .html) | `Read` the file — treat as requirements document |
| `file=<path>` (.doc / .docx) | Cannot read binary — ask user to export as `.md` or `.txt` |
| `context` or `file=context` | `Glob context/**` → `Read` all files found — use as full input context |
| Screenshot / wireframe | Read as image — treat as visual spec |

---

## Phase 1 — Discovery & Analysis (read-only, no changes)

A feature is not in the repo yet — discover the **insertion point** (the nearest existing
analog feature to extend), not "the feature". Read structure/signatures, never implementations.

1. Resolve requirements via **Input Resolution** above. Fetch project/wiki if linked.
2. **Knowledge graph first (kernel F-KG):** if a `knowledge-graph` MCP server
   is connected, use `search_knowledge`/`get_context_pack` and
   `find_service`/`get_service_context` to locate the nearest existing analog
   capability and its structure before scanning the repo — it returns the
   exact files/classes to open. Fall back to step 3 only when the server
   isn't connected or the query comes back unresolved.
3. ONE `search_repositories` for the closest existing analog capability
   (skip if step 2 already resolved it).
   Get file list + signatures via `get_repository_tree` (single module, shallow) + `get_file_contents` (signatures only).
4. Standards (lazy): Read `coding-standards.md` + standards for layers the feature will touch. Skip if cached.
5. Enumerate every layer to create/modify. Build the PARTS → PHASES → TASKS breakdown.

Output the analysis blocks (contract §12):

```text
## ROOT CAUSE / REQUIREMENT
<what needs to be built and why>

## IMPACT ANALYSIS
Affected Areas: UI · Backend · Database · Integrations · APIs · Reports
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

Execute only the approved Parts/Phases in order.

1. Implement each TASK in sequence within the approved scope.
2. Reuse existing patterns — design by analogy, not invention.
3. Validation at each Part completion:
   - Completeness (contract §7): every layer of the approved scope covered.
   - Regression (contract §8): nothing already working is broken.

---

## Output

Requirement analysis · implementation (per approved Parts/Phases) · validation (§7 + §8) · audit line · Execution Summary (contract §13).
Budget: 3–5 structure files in Phase 1 · ≤ 40 files total · ≤ 40k tokens per feature.
