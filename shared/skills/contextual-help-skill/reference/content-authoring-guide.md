# Content Authoring Guide

How the reference help is written (CCC, 4 tabs) and the rules to reproduce that quality on any
screen. Copy is data in `<prefix>-help-content.ts`.

## 1. Where facts come from (in order)

1. The screen's own code: form controls, validators, `disabled`/`*ngIf` rules, save handlers,
   cascade logic, permission checks, API error handling.
2. Redmine story / BRD / PLAN.md for the screen.
3. The user (product owner / QA) for anything unverifiable.

Never write a rule you can't point to. In the PR/summary list the source for each rule.

## 2. Section-by-section recipe

### title
Tab/screen name only ("Configuration", "History"). The dialog subtitle "Contextual help" is
fixed by the template.

### about (always)
2–4 sentences. Pattern: **what it controls/shows → for whom → scoped by what → key precedence
rule**.
> "Controls which clinical note components … a Doctor or Nurse can Access, Edit, or must treat as
> Mandatory — per Care Setting …, Clinical Type …, and configuration level …. Settings made at a
> higher level apply to every level below it unless a lower level overrides them."

### howTo (always, ordered)
- 3–6 imperative steps, user-visible UI wording in **exact label text**, buttons in quotes.
- One action per step; include the consequence when non-obvious
  ("…copies the resolved values as a starting point and makes the grid editable").
- Quote on-screen messages exactly: `"Resolved from Customer (read-only here)"`.

### fields (name → description)
- `name` = the exact column/field label (add role in brackets when it differs:
  "Access (Doctor Specialty)").
- Description = what it means + dependency/side-effect in one sentence
  ("Turning Access off also clears Mandatory …", "Requires Access to be on").
- Cover every input, column, filter and badge/tag a user sees. Skip pure layout.

### rules (amber box)
- Rules the system **enforces** — dependencies, cascades, overwrites, defaults, limits,
  permission constraints, legacy-parity exceptions.
- State as a fact, present tense, no hedging.
- Mention irreversible/cascading effects here.

### examples
- 1–3 concrete scenarios with real-looking names (component names, levels) and the outcome.
- Show the *effect*, not just the action ("… every Site under that Region now sees HPI as
  unavailable").
- No real patient/customer/site names.

### notes (red box)
- Gotchas that cause support tickets: read-only states, destructive actions, automatic refresh,
  expected-not-an-error messages, data-loss conditions.
- Keep to 1–3 bullets; if everything is "important", nothing is.

### faqs (accordion, question as header)
Write the question **in the user's voice, as they'd type it into a ticket**:
- "Why can't I tick Mandatory?"
- "I created a rule here but the Components tab still shows the old list — why?"
- "I don't see a change I just made — why?"
- "Can I undo an import after confirming?"
- "Does a change here affect past patient notes?"

Mandatory FAQ families to consider for every screen (include those that apply):
1. **Why is X disabled / not clickable / missing?** (dependencies, permissions, state)
2. **Why didn't my change save / show?** (staged edits, filters, date defaults, refresh)
3. **Can I undo / what happens to existing data?** (reversibility, history impact)
4. **What's the difference between A and B?** (levels, types, statuses)
5. **Why do I see changes I didn't make?** (cascade, import, background jobs)
6. **Does this affect other modules/care settings?** (scope boundaries)

Answers: 1–3 sentences, start with the direct answer, then the remedy
("Check …", "Use …", "Switch to …").

## 3. Style rules

- Plain business language; domain terms exactly as shown on screen (Customer / Region / Site,
  Access / Edit / Mandatory). Define abbreviations once (OP/IP/ER/DC) where first used.
- Active voice, present tense, short sentences. Em dash (—) for clauses, curly-free ASCII quotes
  escaped as `\"` in TS strings.
- Long strings split with `+` across lines (as the reference does) — keep each line ≤ ~120 chars.
- No HTML, no markdown, no emojis, no links to internal URLs, no ticket numbers.
- No PHI, no environment/tenant specifics, no version numbers, no dates.
- No marketing tone, no "simply/just/easy".
- No duplicate facts across sections; rules explain *what is enforced*, notes explain *what to
  watch out for*, FAQ answers *specific confusions*.
- Keep each tab's help to roughly: 3–6 howTo, 3–7 fields, 2–5 rules, 1–3 examples, 1–3 notes,
  3–6 FAQs. Smaller screens may omit fields/rules/examples/notes (use `[]`); About + How to use
  are never omitted.

## 4. Per-tab / per-mode differences

- If behaviour differs by mode (e.g. DISCHARGE only exposes Mandatory, Doctor vs Nurse columns),
  state it as an explicit rule and label fields with the role in brackets.
- Cross-tab effects (retire on Components → grid refresh on Configuration) belong in `notes` of
  the originating tab and an FAQ on the affected tab.

## 5. Maintenance

- Help content changes in the **same PR** as the behaviour it describes.
- When removing/renaming a label, grep the content file for the old label.
- Keep keys stable; adding a tab = add key to the union, content const, host index map.

## 6. Anti-patterns

- Restating the UI ("Click Save to save").  → say the consequence.
- Vague rules ("Be careful when editing").  → state the enforced behaviour.
- Question headers that are statements ("Mandatory is disabled").  → "Why can't I tick Mandatory?"
- Documenting features not shipped yet.
- Copy that contradicts the legacy screen's behaviour without saying so.
