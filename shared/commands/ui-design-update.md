---
description: UI agent — fix UI bugs, develop new UI components, or apply design file updates. Supports Angular (web) and Flutter (mobile) — preserves all Angular bindings or Flutter widget structure. Approval required before changes. Use auto=true to skip gate.
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

## Stack Detection

Detect the UI stack from the input before Phase 1:

| Signal | Stack |
| --- | --- |
| `.component.ts` / `.component.html` / `.component.scss`, `angular.json` in the resolved component path | **Angular** |
| `.dart` files, `pubspec.yaml`, `lib/features/**` layout | **Flutter** |
| Ambiguous (e.g. only a free-text user story, no file signal) | Ask one clarifying question: "Is this Angular (web) or Flutter (mobile)?" |

The detected stack determines which standards load (`frontend/*` vs `mobile/*`) and which
MUST-PRESERVE list and file-touch constraints apply in Execution Phase below.

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
UI Agent Session started.  Skill loaded once.

Handles three types of UI work, on Angular (web) or Flutter (mobile):
  BUG FIX    — fix a broken UI component / widget
  NEW DEV    — build a new UI component/screen or Flutter widget
  DESIGN     — apply a design reference to an existing component/widget

Provide one of:
  • component=<ComponentName>              — load from GitLab (Angular or Flutter)
  • Paste the component HTML or widget .dart source — use directly
  • Attach a screenshot                    — visual spec or error snapshot
  • file=<path>                            — .md / .txt / .html design spec or requirements
  • context                                — scan context/ folder (any filenames)
  • User story (free text)                 — "The ward list should show..."
  • Format A paths:
      Component needs change :- <folder>
      Component to refer :-    <design HTML file>
  • Format B short args: <project> <component-slug> <design-file>

Options:
  • auto=true    — skip approval gate for this session

If the stack (Angular vs Flutter) is not obvious from the input, I will ask once.
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
| `component=<Name>` (Angular) | `get_file_contents` for `.html`, `.ts`, `.scss` from GitLab |
| `component=<Name>` (Flutter) | `get_file_contents` for the widget's `.dart` file(s) under `lib/features/<feature>/` from GitLab |
| Pasted HTML or `.dart` widget source | Use directly as current component/widget state |
| Screenshot / image | Read as image — error context (BUG FIX) or visual target (DESIGN UPDATE / NEW DEV) |
| `file=<path>` (.md / .txt / .html) | `Read` — design spec, requirements, or bug report |
| `file=<path>` (.doc / .docx) | Cannot read binary — ask user to export as `.md` or `.txt` |
| `context` or `file=context` | `Glob context/**` → `Read` all files found — use as full input context |
| User story (free text) | Extract UI requirements, actors, expected visual behaviour |
| Format A paths | Read component folder + design HTML file directly (Angular) |
| Format B short args | Resolve `d:\GitLab Workspace\UI\Core\Clinical\projects\<project>\src\lib\app\pages\` + design root (Angular only) |

---

## Phase 1 — Discovery & Analysis (read-only, no changes)

### For BUG FIX — Angular

1. Load component (`.html`, `.ts` first 150 lines, `.scss`).
2. If screenshot provided: read as image to identify the visual defect.
3. If console error provided: identify the Angular/TS symbol involved.
4. Grep `.component.ts` for relevant event bindings, structural directives, `@Input`/`@Output`.
5. Standards (lazy): Read `frontend/component.md` + `coding-standards.md`. Skip if cached.

### For BUG FIX — Flutter

1. Load the widget file(s) (`.dart`, full for the widget class; state/Bloc file signatures only).
2. If screenshot provided: read as image to identify the visual defect.
3. If a stack trace/console error provided: identify the widget/class involved.
4. Grep the widget file for callbacks (`onPressed`, `onChanged`, `onTap`), `key:` usages, `BlocBuilder`/`Consumer` scoping.
5. Standards (lazy): Read `mobile/widget.md` + `coding-standards.md`. Skip if cached.

### For NEW DEV — Angular

1. **Knowledge graph first (kernel F-KG):** if a `knowledge-graph` MCP server
   is connected, use `search_knowledge`/`find_service` to locate the nearest
   existing analog component before scanning — it returns the exact
   component name/path directly. Fall back to step 2 only if unresolved.
2. Identify the closest existing analog component via `search_repositories`.
3. Load analog component signatures only (not body).
4. Standards (lazy): Read `frontend/component.md`, `frontend/custom-components.md`. Skip if cached.

### For NEW DEV — Flutter

1. **Knowledge graph first (kernel F-KG):** same as above — check the
   `knowledge-graph` MCP server before scanning, if connected.
2. Identify the closest existing analog screen/widget via `search_repositories` (or `Glob lib/features/**`).
3. Load analog widget signatures only (not body).
4. Standards (lazy): Read `mobile/widget.md`, `mobile/state-management.md`. Skip if cached.

### For DESIGN UPDATE — Angular

1. Read the design reference HTML file in full.
2. Load existing component: `.html` (full), `.scss` (full), `.ts` first 150 lines.
3. Grep `.ts` for all bindings: `(click|change|submit)`, `[(ngModel)]`, `*ngIf|*ngFor`, `#refs`, `@Input|@Output`.
4. Standards (lazy): Read `frontend/component.md`. Skip if cached.

### For DESIGN UPDATE — Flutter

1. Read the design reference (HTML, image, or a reference `.dart` widget) in full.
2. Load the existing widget's `build()` method and surrounding widget tree in full; Bloc/state/repository files at signature-only depth.
3. Grep the widget file for all bindings: callbacks (`onPressed`, `onChanged`, `onTap`), `key:` usages, `BlocBuilder`/`BlocListener`/`Consumer` wiring, `Semantics`/accessibility properties.
4. Standards (lazy): Read `mobile/widget.md`. Skip if cached.

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

**No file writes in this phase. `.component.ts` (Angular) is NEVER modified. Flutter Bloc/Cubit/Repository (business-logic) files are NEVER modified.**

---

## Approval Gate (contract §14)

If `auto=true` was set: skip and proceed to Execution Phase.

Otherwise: STOP. Output analysis blocks and ask:

```text
Approve implementation? (approve / yes / proceed / implement)
```

---

## Execution Phase (after approval or auto=true)

### BUG FIX — Angular

1. Apply the minimal fix to `.component.html` / `.component.scss` only.
2. Preserve ALL: event bindings, structural directives, form controls, `@Input`/`@Output`, pipes, template refs, `routerLink`, accessibility attributes.

### BUG FIX — Flutter

1. Apply the minimal fix inside the widget's `build()` method / widget tree only.
2. Preserve ALL: callbacks, `key:` usages, `BlocBuilder`/`Consumer` scoping, `const` constructors, `Semantics`/accessibility properties.

### NEW DEV — Angular

1. Generate new `.component.html` and `.component.scss` following analog patterns.
2. Provide stub `.component.ts` structure (no full implementation — just public interface).
3. Never introduce new UI libraries not already in the project.

### NEW DEV — Flutter

1. Generate a new widget/screen following analog patterns (`mobile/widget.md`).
2. Provide stub Bloc/Cubit + state classes (no full business logic — just the public event/state surface, per `mobile/state-management.md`).
3. Never introduce a second state-management or routing library not already in the project.

### DESIGN UPDATE — Angular

1. Rewrite `.component.html` to match design reference structure.
2. Add new CSS classes to `.component.scss` only — never remove existing ones.
3. Preserve every binding (see §MUST PRESERVE below).

### DESIGN UPDATE — Flutter

1. Rewrite the widget tree inside `build()` to match the design reference structure.
2. Add new styling (colors/text styles/spacing) via the project's existing theme — never inline hardcoded values that duplicate an existing theme token.
3. Preserve every binding (see §MUST PRESERVE below).

**MUST PRESERVE — Angular:**

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

**MUST PRESERVE — Flutter:**

- Callbacks: `onPressed`, `onChanged`, `onTap`, `onSubmitted`, etc.
- `key:` values (`ValueKey`/`ObjectKey`) on list items and testable widgets
- `BlocBuilder` / `BlocListener` / `Consumer` scoping and the types they're bound to
- Conditional rendering logic (`if`/ternary in the widget tree, `Visibility`, `Offstage`)
- Navigation calls (`context.go`/`context.push`) and route names
- Localization calls (`AppLocalizations.of(context)` or equivalent) — never hardcode replacement strings
- `Semantics`, `aria`-equivalent accessibility properties, `tooltip`
- Child widget types and their constructor parameters in use

**NEVER touch Bloc/Cubit, state, or repository files.**

Validation:

- Completeness (contract §7, UI items applicable).
- Regression (contract §8): existing bindings, UI flows, permissions intact.
- All event bindings/callbacks from the original present in the rewritten template/widget tree.

---

## Output

Task type · stack (Angular/Flutter) · analysis · changes (HTML/SCSS diffs, or Dart widget-tree diffs) · validation (§7 + §8) · audit line · Execution Summary (contract §13).
Budget: ≤ 5 files, ≤ 8k tokens + image per component/widget.
