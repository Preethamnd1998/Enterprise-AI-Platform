---
description: UI agent — fix UI bugs, develop new UI components, or apply design file updates. Preserves all Angular bindings. Approval required before changes. Use auto=true to skip gate.
argument-hint: "component=<Name> | file=<path.md> | \"<bug description / user story>\" [auto=true]"
allowed-tools: Read, Grep, Glob, Edit, Write, mcp__gitlab-reader__get_file_contents, mcp__chrome-devtools-mcp__take_screenshot, mcp__chrome-devtools-mcp__take_snapshot, mcp__chrome-devtools-mcp__list_console_messages
---

# Command: /ui-design-update

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **UI Agent**. Input: `$ARGUMENTS`.

---

## Mode Detection

Parse `auto=true` from arguments. Store as session flag.

**If `$ARGUMENTS` is empty → Session Mode.**
**If `$ARGUMENTS` is non-empty → Direct Mode** (skip to Input Resolution below).

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
UI Agent Session started.  Skill loaded once.

Handles three types of UI work:
  BUG FIX    — fix a broken UI component
  NEW DEV    — build a new UI component or screen
  DESIGN     — apply a design reference HTML to an existing component

Provide one of:
  • component=<ComponentName>              — load from GitLab
  • Paste the component HTML               — use directly
  • Attach a screenshot                    — visual spec or error snapshot
  • file=<path>                            — .md / .txt design spec or requirements
  • User story (free text)                 — "The ward list should show..."
  • Format A paths:
      Component needs change :- <folder>
      Component to refer :-    <design HTML file>
  • Format B short args: <project> <component-slug> <design-file>

Options:
  • auto=true    — skip approval gate for this session

Type 'done' to end the session.
```

For each task the user provides in this session:

1. Classify the task type (BUG FIX / NEW DEV / DESIGN UPDATE) from the input.
2. Run **Input Resolution**, then **Phase 1 — Discovery & Analysis**.
3. Run **Approval Gate** (skip if `auto=true`).
4. After approval: run **Execution Phase**.
5. Append **Execution Summary** (contract §13).
6. Print: `─── UI task complete. Next? (or 'done') ───`
7. Wait for the next input. Repeat until user types `done`.
8. When user types `done`: print **Session Summary** (contract §13) and close.

**Token discipline:** Frontend standards already read this session are NOT re-read.
Design root and Angular root resolved in prior tasks are reused.

---

## Task Classification

| Input signals | Task type |
| --- | --- |
| Stack trace, console error, broken layout screenshot, "bug" / "fix" / "broken" | **BUG FIX** |
| "new component", "new screen", "add", "create", user story with new feature | **NEW DEV** |
| Design HTML file paths (Format A/B), "update to match design", design spec file | **DESIGN UPDATE** |

When ambiguous, ask one clarifying question before proceeding.

---

## Input Resolution

| Input | Action |
| --- | --- |
| `component=<Name>` | `get_file_contents` for `.html`, `.ts`, `.scss` from GitLab |
| Pasted HTML | Use directly as current component state |
| Screenshot / image | Read as image — error context (BUG FIX) or visual target (DESIGN UPDATE / NEW DEV) |
| `file=<path>` (.md / .txt) | `Read` — design spec, requirements, or bug report |
| `file=<path>` (.doc / .docx) | Cannot read binary — ask user to export as `.md` or `.txt` |
| User story (free text) | Extract UI requirements, actors, expected visual behaviour |
| Format A paths | Read component folder + design HTML file directly |
| Format B short args | Resolve `d:\GitLab Workspace\UI\Core\Clinical\projects\<project>\src\lib\app\pages\` + design root |

---

## Phase 1 — Discovery & Analysis (read-only, no changes)

### For BUG FIX

1. Load component (`.html`, `.ts` first 150 lines, `.scss`).
2. If screenshot provided: read as image to identify the visual defect.
3. If console error provided: identify the Angular/TS symbol involved.
4. Grep `.component.ts` for relevant event bindings, structural directives, `@Input`/`@Output`.
5. Standards (lazy): Read `frontend/component.md` + `coding-standards.md`. Skip if cached.

### For NEW DEV

1. Identify the closest existing analog component via `search_repositories`.
2. Load analog component signatures only (not body).
3. Standards (lazy): Read `frontend/component.md`, `frontend/custom-components.md`. Skip if cached.

### For DESIGN UPDATE

1. Read the design reference HTML file in full.
2. Load existing component: `.html` (full), `.scss` (full), `.ts` first 150 lines.
3. Grep `.ts` for all bindings: `(click|change|submit)`, `[(ngModel)]`, `*ngIf|*ngFor`, `#refs`, `@Input|@Output`.
4. Standards (lazy): Read `frontend/component.md`. Skip if cached.

Output analysis blocks (contract §12):

```text
## ROOT CAUSE / REQUIREMENT
Task type: BUG FIX / NEW DEV / DESIGN UPDATE
<summary of what is broken / what needs building / what design changes are needed>

## IMPACT ANALYSIS
Affected Areas: UI
Risk Level: Low / Medium / High

## IMPLEMENTATION BREAKDOWN
PART 1 - UI
  PHASE 1.1 - <component.html changes>
    TASK 1.1.N <description>
  PHASE 1.2 - <component.scss changes>
    TASK 1.2.N <description>

## CHANGE ESTIMATE
Files Read: N | Est. Files Modified: N | UI: N | Backend: 0 | DB Objects: 0
Complexity: Small / Medium / Large
```

**No file writes in this phase. `.component.ts` is NEVER modified.**

---

## Approval Gate (contract §14)

If `auto=true` was set: skip and proceed to Execution Phase.

Otherwise: STOP. Output analysis blocks and ask:

```text
Approve implementation? (approve / yes / proceed / implement)
```

---

## Execution Phase (after approval or auto=true)

### BUG FIX

1. Apply the minimal fix to `.component.html` / `.component.scss` only.
2. Preserve ALL: event bindings, structural directives, form controls, `@Input`/`@Output`, pipes, template refs, `routerLink`, accessibility attributes.

### NEW DEV

1. Generate new `.component.html` and `.component.scss` following analog patterns.
2. Provide stub `.component.ts` structure (no full implementation — just public interface).
3. Never introduce new UI libraries not already in the project.

### DESIGN UPDATE

1. Rewrite `.component.html` to match design reference structure.
2. Add new CSS classes to `.component.scss` only — never remove existing ones.
3. Preserve every binding (see §MUST PRESERVE below).

**MUST PRESERVE in all task types:**

- Event bindings: `(click)`, `(change)`, `(ngSubmit)`, etc.
- Property bindings: `[disabled]`, `[class]`, `[style]`
- Two-way bindings: `[(ngModel)]`
- Form directives: `formGroup`, `formControlName`
- Structural directives: `*ngIf`, `*ngFor`, `*ngSwitch`
- `routerLink` and router directives
- Pipe usages: `| date`, `| translate`
- `#templateReference` variables
- Child component selectors in use
- `aria-*`, `role`, `tabindex`

**NEVER touch `.component.ts`.**

Validation:

- Completeness (contract §7, UI items applicable).
- Regression (contract §8): existing bindings, UI flows, permissions intact.
- All event bindings from original present in rewritten HTML.

---

## Output

Task type · analysis · changes (HTML/SCSS diffs) · validation (§7 + §8) · audit line · Execution Summary (contract §13).
Budget: ≤ 5 files, ≤ 8k tokens + image per component.
