---
name: global-filter-skill
description: |
  Sub-skill of global-filter-pagination-skill. Build the Lifetrenz "global filter" for a list
  screen exactly like the All Appointments reference: top-bar search box + expand arrow that
  opens a 480px overlay hosting a named `searchbar` router-outlet; inside it a 30/70 splitter with
  time-range chips (Today / Last 24 hours / Last 7, 15, 30 days / Next 7, 15, 30 days), From/To
  calendars for custom dates, the field filters, Clear / Search buttons, Save Filter overlay and
  the saved-filter list (set default, rename, delete). Defaults to Today when the screen has a date
  range, a saved default filter wins, Clear restores the default. Covers the exact markup, SCSS,
  button colours, form controls, SearchMenuService events, shared form service, saved-filter API,
  host-page wiring and a behaviour matrix. MUST be loaded when adding or porting a filter panel,
  search, saved/default filter or time-range filter on any Lifetrenz Angular list screen.
---

# Global Filter Skill

Parent: `../global-filter-pagination-skill/SKILL.md` (contracts, backend, QA).
Pagination footer: `../pagination-skill/SKILL.md`.
Reference component (clone it): `searchbar-all-appointment` + `AllAppointmentService` + `AllAppointmentsComponent`
(`front-desk-management`). Paths in `../global-filter-pagination-skill/reference/source-map-and-discrepancies.md`.

## The five pieces (all required, per screen)

| # | Piece | Template | Reference |
|---|---|---|---|
| 1 | Filter panel component `app-searchbar-<feature>` (standalone) | `templates/searchbar.component.{ts,html,scss}.tpl` | `SearchbarAllAppointmentComponent` |
| 2 | Shared root-service FormGroup + time list + chip text | `templates/filter-form.service.ts.tpl` | `AllAppointmentService` |
| 3 | Aux route on outlet `searchbar` + shell overlay | `templates/routing-and-shell.md.tpl` | `FdmMainComponent`, `fdm-routing.module.ts` |
| 4 | Host list page wiring (`setupSearch`, `handleSearch`, `handleTopBarSearch`, fetch) | `templates/host-integration.ts.tpl` | `AllAppointmentsComponent` |
| 5 | Saved-filter plumbing: `FilterComponentType` member (UI+BE), `ConponentSearchService`, API | `reference/saved-filter-backend.md` | `OPComponentFilterController` |

The filter panel and the list are **siblings in different router outlets** → they communicate only through
`SearchMenuService` events + the shared root-service form. Never wire them with `@Input/@Output`, never call the
list from the panel. (A literal child panel with @Input/@Output is allowed only if it is *not* mounted in the
aux outlet — and then it is not "the global filter"; prefer the reference shape.)

## Behaviour, in one paragraph

Opening the page: the **host** `setupSearch()` makes the top-bar search visible, sets placeholder, date label "Today" and the
aux-route name (`searchRoute`), subscribes to `searchBarViewEvent$` and `searchDataEvent$`, then loads the saved filters
(`type + level USER + user + site + business`, `filterLoadInFlight=true`). On the response its `applyFilter()` patches the
`isDefault` filter into the shared form (or `rangeDate = "Today"` with everything else empty when none) and fires the first
fetch. The panel is created only when the overlay opens (shell navigates the `searchbar` outlet) and re-loads the list;
if it finds a default it re-applies it and searches once in `ngAfterViewInit` (500 ms). Chip click →
`rangeDate = label`. Custom From/To → `rangeDate=[from,to]` and the chip selection clears. **Search** (or Enter in a
field) → `callAppointment()` → expands the label to dates → emits `SearchFilterEvent{type, filterValue=JSON(form)}`. The
host's `handleSearch` resets `paginator.first=0`, updates the top-bar chip text, fetches page 0. **Clear** → default
filter if present else Today. **Save Filter** → name popup (auto "Filter N") → saved non-default; the ★ icon sets it as
the single default; name edits on Enter; trash deletes.

## Workflow

1. Decide the 3 shapes (parent skill table). This skill is for "filter my own list".
2. Add `FilterComponentType.<NEWKEY>` in `patient-lib` UI enum **and** the BE enum (`…core.search.enums.FilterComponentType`);
   check whether the DB column has a constraint/ lookup that needs a migration (High risk gate if yes).
3. Pick the saved-filter API family matching the owning BE service: OPD (`ipd-service /opd/component/filter`), CORE
   (core-service), APPOINTMENT (appointment-service) — `ConponentSearchService` has all three. Reuse DTOs; never create new ones.
4. Generate the files from `templates/`; fill the **field map** (control name ↔ API param ↔ BE param ↔ column) in
   `reference/ui-spec.md §6` form first, then code.
5. Wire the host; wire the route + shell (`routing-and-shell.md.tpl`).
6. Pagination: `../pagination-skill/SKILL.md`. Backend: parent skill.
7. Run `reference/behaviour-matrix.md` scenarios.

## Hard rules

- Visuals/classes/inline styles/colours exactly as `reference/ui-spec.md`. No new colours, no new layout.
- Each field control: `(keydown.enter)="callAppointment()"` equivalent (`search()`), `appendTo="body"` on every overlay widget
  (dropdown, multiselect, calendar), `border: 1px solid rgb(0 0 0 / 23%)` inline style, `minWidth: 100%`.
- The form value is saved as an **opaque JSON string** (`formValue`). On load, patch each control explicitly (as
  `onSelectFilter` does); re-hydrate object options by identity code (e.g. visitType) and dates via `convertToValidDate`
  (JSON turns Dates into strings).
- Branch on `typeof rangeDate === 'string'` vs `Array.isArray` everywhere the field is touched.
- Always reset pagination before the fetch; unsubscribe both subscriptions in `ngOnDestroy`.
- A screen **without** a time range omits the left chip column and the date label (`appData.isDateVisible=false`) — nothing else changes;
  backend returns recent-first.
- Quick-search (top-bar free text) behaviour is per page: it must reset the form, set today's range (if any) and patch
  exactly one field (e.g. `patientNameMpi`). There is no cross-page contract.
- Reference defects are not copied (console.log, typo class, dead blocks) — see parent discrepancies §3.

## Files

| File | What |
|---|---|
| `reference/ui-spec.md` | Exact layout, markup, classes, colours, buttons, saved list rows, per-field-type recipes |
| `reference/events-and-state.md` | SearchMenuService members, sequence diagrams, state variables, subscriptions, gotchas |
| `reference/saved-filter-backend.md` | Endpoints, DTO, default-uniqueness rule, SQL, enums |
| `reference/behaviour-matrix.md` | Scenario → expected result (test script) |
| `templates/*` | searchbar component TS/HTML/SCSS, form service, host wiring, routing+shell, spec |
