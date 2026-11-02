# Placement Guide — where the "?" goes

The reference places the help button in the **right end of the p-card header strip**. Use the
row below that matches the host screen. Always the same component, icon and tooltip.

| Host shape | Where | Key strategy |
|---|---|---|
| **p-card with custom header template** (reference) | `justify-content-right` div of the header strip | `[activeTab]` bound to a field updated in `(onChange)` of tabview |
| **Single screen, p-card, no tabs** | same header strip, same markup | one key `"main"`; no `activeTab` binding (default) |
| **Tabbed screen (`p-tabView`)** | one help in shell header, NOT inside each tab | `HELP_TAB_BY_INDEX` array → key; set in `(onChange)` |
| **Routed child pages (router outlet tabs)** | in shell header; derive key from `route.snapshot.data['helpKey']` or router URL | key from route data |
| **Page with plain `<h2>` title bar (no p-card)** | right side of the title row (`flex justify-content-between align-items-center`) | same |
| **Dialog / drawer screen** | right side of dialog header next to title, before close icon; help dialog is a second modal | key `"main"` |
| **Table/list toolbar** | not here — help belongs to the screen header, not the toolbar | — |
| **Single field / widget explanation** | NOT this skill (use a `pTooltip` or `pi-info-circle` inline hint) | — |

## Rules

1. One help instance per screen shell. Tabs change the key.
2. Help button is always the right-most item of the header's right group
   (e.g. `[Export] [Refresh] [?]`).
3. Header strip classes must remain as the reference:
   `flex justify-content-between align-items-center p-3 bg-primary-50 border-round-top`.
   If the host card already has a different header, wrap its right-hand actions in a
   `justify-content-right` div and add the help component there; do not restyle the host.
4. Key mapping lives in the host as a typed constant, not a switch in the template:
   ```ts
   const HELP_TAB_BY_INDEX: XxxHelpTab[] = ["a", "b", "c"];
   onTabChange(ev: { index: number }): void {
     this.helpTab = HELP_TAB_BY_INDEX[ev.index] ?? "a";
   }
   ```
   If tabs are conditional (`*ngIf` on tab panels), index mapping breaks — derive the key from
   the panel header/value instead.
5. Where the screen is reused across contexts (e.g. OP/IP/ER/DC via route data), the **same help
   component** is reused; only the host passes context. If context changes wording, put
   context-neutral copy in the content ("per Care Setting (OP/IP/ER/DC)") rather than forking.
6. Placement of the help component folder: next to the host, `<feature>/<prefix>-help/`
   (reference: `clinical-component-config/ccc-help/`).
7. Module boundaries: do not import another module's help component across restricted
   boundaries (e.g. emergency → `@inpatient` is forbidden). Copy the four files locally and
   change the prefix.
8. Don't place help in screens that already render a `lib-*-help` — extend its content instead.

## Reuse vs copy

| Situation | Action |
|---|---|
| New screen in same library | generate new `<prefix>-help` from templates |
| Multiple screens in one feature | one help component, multiple keys |
| Different library/app | copy templates, change prefix/selector |
| Many screens want identical shell | candidate for shared `lib-contextual-help` (shell) taking `[content]`; raise with the team before creating — do not do it silently |

## Typical hosts

- Settings screens (`settings` ui-library): card header strip as reference.
- Clinical casesheet sections: header row of the section card.
- Support ticket management (`ui-library/support-ticket-management`): list/detail page header
  strip; one key per page.
