---
name: contextual-help-skill
description: |
  Create and place a Contextual Help button + dialog (the "?" icon in a card header that opens a
  branded dialog with About / How to use / Field descriptions / Business rules / Examples /
  Important notes / FAQs) on any Angular + PrimeNG screen, pixel-identical to the reference
  implementation `lib-ccc-help` in Clinical Component Configuration (settings UI library).
  Covers the exact icons, colours, gradient header, section card styling, placement in the
  p-card header, tab-aware content switching, the typed content model, how to write the copy
  (questions, rules, examples, notes), copy-ready templates, a placement decision table, a spec
  template and a QA checklist. MUST be loaded by any agent or developer asked to add, port,
  extend or review contextual help / help dialog / "?" info button on a Lifetrenz Angular screen
  (settings, clinical, billing, support-ticket or any other ui-library module).
---

# Contextual Help Skill

One consistent, self-contained, copy-pasteable help pattern for every screen. The visual and
structural truth is the reference implementation below — **do not redesign it**, clone it.

## Reference implementation (source of truth)

Repo: `novel/his-ehr/ui/ui-library/settings` — branch `development`
Folder: `src/lib/module/clinical-component-config/`

| File | Role |
|---|---|
| `clinical-component-config.component.ts` | Host shell. Places `<lib-ccc-help [activeTab]="helpTab">` in the p-card header; maps tab index → help key (`HELP_TAB_BY_INDEX`) and updates `helpTab` in `(onChange)` |
| `ccc-help/ccc-help.component.ts` | Standalone help component: `@Input() activeTab`, `visible`, `content`, `open()` |
| `ccc-help/ccc-help.component.html` | "?" button + `p-dialog` with 7 fixed sections |
| `ccc-help/ccc-help.component.scss` | Gradient header, badge, section cards, rules/notes tints, field rows |
| `ccc-help/ccc-help-content.ts` | `CccHelpSection` interface + one const per tab + `CCC_HELP_CONTENT` map |

Read these (via gitlab-reader `get_file_contents`, ref `development`) only if a template below
leaves a doubt. Templates here are already extracted verbatim.

## Workflow

1. **Resolve scope** — which screen, is it tabbed or single, which module/library folder. Use the
   placement table in `reference/placement-guide.md`. Never scan the repo; open the host
   component and its template only.
2. **Gather content facts** — from the screen's own code (form fields, validators, enable/disable
   rules, permission checks), its Redmine story/BRD/plan, and the user. Never invent business
   rules. If a rule can't be confirmed, drop it or ask — see `reference/content-authoring-guide.md`.
3. **Generate the 4 files** from `templates/` into `<feature-folder>/<prefix>-help/`:
   - `help-content.ts.tpl` → `<prefix>-help-content.ts`
   - `help.component.ts.tpl` → `<prefix>-help.component.ts`
   - `help.component.html.tpl` → `<prefix>-help.component.html`
   - `help.component.scss.tpl` → `<prefix>-help.component.scss`
   - optional `help.component.spec.ts.tpl` → `<prefix>-help.component.spec.ts`
   Replace placeholders (table below). Keep HTML structure, classes, icons, colours, dialog
   props exactly as in the templates.
4. **Wire into the host** — follow `templates/host-integration.md.tpl` (import, header slot,
   tab-key mapping).
5. **Verify** — run the checklist in `reference/qa-checklist.md`; build/serve only the touched
   module; test only the new help spec (scoped-testing rule).

## Placeholders

| Placeholder | Example (CCC) | Rule |
|---|---|---|
| `__PREFIX__` | `ccc` | short kebab feature key, unique in the library |
| `__Pascal__` | `Ccc` | PascalCase of prefix |
| `__SELECTOR__` | `lib-ccc-help` | `<lib-or-app-prefix>-<prefix>-help` (lib- in ui-library, app- in apps) |
| `__KEYS__` | `"configuration" \| "components" \| "import" \| "history"` | union of help keys; single-screen → `"main"` |
| `__SCREEN__` | `Clinical Component Configuration` | human name, used in comments only |
| `__PREFIX_UPPER__` | `CCC` | UPPER_SNAKE of prefix (content map const `CCC_HELP_CONTENT`) |
| `__DEFAULT_KEY__` | `configuration` | first/default help key (`main` for single screens) |
| `__KEY_CONST__` | `CONFIGURATION` | UPPER_SNAKE const per key; duplicate the const block for each extra key and add it to the content map |

## The pattern in one screen (do not deviate)

- **Trigger**: `p-button`, icon `pi pi-question-circle`, `[rounded]="true" [text]="true"`,
  tooltip `Help` at `left`. Sits at the **right end of the card header**, in a
  `justify-content-right` div, opposite the title block.
- **Dialog**: modal, `width: 50rem`, `breakpoints { '960px': '90vw' }`, `dismissableMask` true,
  `styleClass="<prefix>-help-dialog"`.
- **Header**: teal→blue gradient `linear-gradient(135deg,#0f766e 0%,#0369a1 100%)`, white round
  badge with `pi pi-info-circle`, white title, uppercase small subtitle "Contextual help".
- **Body**: scrollable (`max-height: 65vh`), stack of rounded section cards with a coloured
  `h4` icon each. Order is fixed: About → How to use → Field descriptions → Business rules
  (amber tint) → Examples → Important notes (red tint) → FAQs (PrimeNG accordion).
- **Empty sections are hidden** (`*ngIf …length`), About and How to use always render.
- **Content is data**, never HTML in the template: typed `HelpSection` objects in a separate
  `-help-content.ts`, keyed by tab.

Full token tables (colours, spacing, fonts, icons per section) → `reference/design-spec.md`.
Copy rules and question-writing → `reference/content-authoring-guide.md`.
Where/how to place on different screen shapes → `reference/placement-guide.md`.

## Hard rules

- Standalone component, `ChangeDetection` default (as reference), imports exactly:
  `CommonModule, ButtonModule, DialogModule, TooltipModule, AccordionModule`.
- No new colours, icons, fonts or dialog sizes. If a screen truly needs a variant, ask first.
- No API calls, no state beyond `visible`; help must work offline and never block the screen.
- Static copy only. No PHI, no tenant/customer names, no environment-specific values.
- Copy must be verifiable against the screen's real behaviour (rules = what the code enforces).
- One help component per screen/shell, not per tab; tab switch changes the **key**, not the
  component.
- Respect cross-module import rules (e.g. emergency must not import `@inpatient`; copy the
  files locally rather than importing across modules).
- Do not use `::ng-deep` outside the single `:host ::ng-deep .<prefix>-help-dialog` block
  (required because the p-dialog is appended outside the component host).
- Coding standards: load `~/.claude/standards/coding-standards.md` + `frontend/component.md`
  before generating; follow the repo's quote style (double quotes in the settings library).

## Output to the user

List files created, host edit (file + lines), help keys and their sources of truth for each
rule, and which checklist items were run. Keep it short.
