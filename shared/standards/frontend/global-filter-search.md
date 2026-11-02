# UI — Global Filter / Searchbar Pattern (FDM)

> Also read: `component.md`, `others.md`.

**Scope note (added 2026-10-13 reorg audit):** this file documents exactly ONE of (at least)
three distinct search/filter subsystems in this codebase — the page-specific FDM filter-panel
pattern below. It is NOT a "global patient search." If the task needs to find an existing
patient *anywhere* in the system (not filter one page's own list), the relevant subsystem is the
Core-owned, cross-module patient-identity search API (`core-service GET /core/patient/list`),
which this file does not cover. See
`shared/knowledge/custom-flows/pagination-global-filter/Global-Filter-Search-Architecture.md`
for the full three-subsystem breakdown (this FDM pattern, the per-page topbar quick-search, and
the Core patient-identity search) before assuming this pattern is the only option, or building a
new module-local search when the reusable Core endpoint already does the job.

The "global filter" in the top bar is **not** a component directly embedded in
the topbar or in the page that uses it — it's a **named/auxiliary router
outlet** wired through a shared pub/sub service. Confirmed against real source
in `front-desk-management`; do not assume simple parent/child embedding when
extending this pattern.

---

## The pieces

**1. Topbar** — `src/app/layout/app.topbar.component.ts` (selector
`app-topbar`). Renders a plain free-text quick-search box, gated by
`*ngIf="appData.isSearchVisible"` (a flag each feature page sets true on
`ngOnInit`), plus a toggle-arrow icon. The arrow calls:

```ts
toggleArrow(): void {
  this.searchMenuService.searchBarToggleEmitEvent(element);
}
```

**2. `SearchMenuService`** — `src/app/layout/service/search-menu.service.ts`,
`providedIn: 'root'`. The pub/sub bridge between the topbar and whatever page
is active. Key streams:

```ts
searchBarToggleEvent$   // topbar arrow clicked — open/close the filter overlay
searchBarViewEvent$     // a rich filter was submitted
searchDataEvent$        // topbar's own free-text box changed
searchStringEvent$
```

**3. The overlay host** — a module's "main" shell component (e.g.
`FdmMainComponent`, `projects/front-desk-management/src/lib/fdm-main/fdm-main.component.ts`)
subscribes to `searchBarToggleEvent$` and toggles a `p-overlayPanel` containing
a **named router outlet**:

```html
<p-overlayPanel #searchOP appendTo="body" ...>
  <router-outlet name="searchbar"></router-outlet>
</p-overlayPanel>
<router-outlet></router-outlet>
```

**4. Routing** — `fdm-routing.module.ts` maps each feature screen to an
auxiliary route on the `searchbar` outlet:

```ts
{ path: 'searchbar-all-appointment', component: SearchbarAllAppointmentComponent, outlet: 'searchbar' }
```

This is a repeated, deliberate FDM-wide convention — dozens of these routes
exist, one per screen (`searchbar-adhoc-schedule`, `searchbar-bed-booking`,
`searchbar-block-patient`, `searchbar-all-appointment-reports`, …), not a
one-off for appointments.

**5. The filter form** — e.g. `SearchbarAllAppointmentComponent`
(`projects/front-desk-management/src/lib/search/searchbar-all-appointment/searchbar-all-appointment.component.ts`,
standalone, selector `app-searchbar-all-appointment`). On submit it does **not**
call the consuming page directly:

```ts
callAppointment(): void {
  const filter: SearchFilterEvent = { ...this.form.value };
  this.searchMenuService.updateSearchBarViewEvent(filter);
}
```

**6. The consuming page** — e.g. `AllAppointmentsComponent`
(`projects/front-desk-management/src/lib/appointment/all-appointments/all-appointments.component.ts`):

```ts
ngOnInit(): void {
  this.appData.isSearchVisible = true;
  this.searchMenuService.searchPlaceHolder = this.translateService.instant('Search appointments');

  this.searchMenuService.searchBarViewEvent$.subscribe(filter => this.handleSearch(filter));
  this.searchMenuService.searchDataEvent$.subscribe(text => this.handleTopBarSearch(text));
}
```

Two parallel search mechanisms converge on the same page: the topbar's plain
free-text box (`searchDataEvent$`), and the rich filter form rendered through
the named `searchbar` outlet (`searchBarViewEvent$`). `FdmMainComponent` also
subscribes to `searchBarViewEvent$` purely to auto-close the overlay once a
filter is submitted.

---

## Adding a new "global filter" screen

1. Build the filter form as its own standalone component (like
   `SearchbarAllAppointmentComponent`).
2. Add an auxiliary route for it on the `searchbar` outlet in the module's
   `-routing.module.ts`.
3. On submit, call `searchMenuService.updateSearchBarViewEvent(filter)` —
   don't wire a direct `@Input`/`@Output` or a call into the consuming page.
4. In the consuming page: set `appData.isSearchVisible = true` in `ngOnInit`,
   subscribe to `searchBarViewEvent$`, and unsubscribe in `ngOnDestroy`.

## Rules

- This is a **per-module** pattern, not one shared global instance — other
  library modules (e.g. `daycare-clinical`) define their own local
  `search-menu.service.ts` following the same convention rather than importing
  the root one. Confirm which module's service you're extending.
- Never bypass `SearchMenuService` to wire a filter form directly to a page
  component — that breaks the toggle/overlay/outlet convention every other FDM
  screen follows.
