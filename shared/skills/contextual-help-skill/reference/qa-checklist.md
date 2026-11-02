# QA Checklist — Contextual Help

## Visual parity with reference (`lib-ccc-help`)
- [ ] Trigger is `pi pi-question-circle`, rounded text button, tooltip "Help" on the left
- [ ] Trigger sits in the right end of the card header strip (`justify-content-right`)
- [ ] Dialog 50rem wide, 90vw below 960px, modal, closes on mask click / X / ESC
- [ ] Header gradient teal→blue, white badge with `pi pi-info-circle`, white title, uppercase "Contextual help" subtitle, white close icon with hover tint
- [ ] Body scrolls at 65vh; sections are rounded cards with 1.1rem gaps
- [ ] Section order: About → How to use → Field descriptions → Business rules (amber) → Examples → Important notes (red) → FAQs (accordion)
- [ ] Section icons and colours exactly per `design-spec.md §5`
- [ ] Empty sections hidden; About and How to use always shown
- [ ] Dark/other theme: card uses `--surface-card` / `--surface-border` vars (rules/notes tints remain fixed, as in reference)

## Behaviour
- [ ] Tab switch (tabbed screens) changes dialog content/title; first tab default is correct
- [ ] Key map length equals tab count; conditional tabs handled
- [ ] Help opens with no network calls, no console errors
- [ ] Multiple openings/closings keep scroll at top (dialog re-created on open)
- [ ] Works inside every context the host is reused (e.g. OP/IP/ER/DC)

## Content
- [ ] Every rule/field/FAQ verified against code or BRD (source noted)
- [ ] Labels quoted exactly as on screen
- [ ] FAQ questions are in user voice and cover the 6 families (authoring guide §2)
- [ ] No PHI, tenant names, versions, dates, URLs, ticket numbers
- [ ] Strings use escaped `\"`, no HTML/markdown/emoji

## Code
- [ ] Standalone component; imports exactly Common/Button/Dialog/Tooltip/Accordion modules
- [ ] Files: `<prefix>-help.component.{ts,html,scss}` + `<prefix>-help-content.ts` in `<prefix>-help/`
- [ ] Selector prefix matches library (`lib-` / `app-`), unique class prefix `<prefix>-help-*`
- [ ] Only one `::ng-deep` block (dialog class); no global style leaks
- [ ] Host diff minimal (import, header div, key map)
- [ ] No cross-module restricted imports (e.g. emergency ↛ `@inpatient`)
- [ ] Lint + build of touched module pass

## Tests (scoped — only the new spec)
- [ ] `<prefix>-help.component.spec.ts` from template passes
- [ ] Do not run or fix unrelated pre-existing specs
