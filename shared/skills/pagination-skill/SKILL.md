---
name: pagination-skill
description: |
  Sub-skill of global-filter-pagination-skill. Add the standard Lifetrenz footer pagination to a
  list screen: the custom `<lifetrenz-lt-pagination>` (PrimeNG paginator + page-size dropdown,
  "N records, M pages in total" report, options 15/25/50/75/100, centred in the table footer),
  component-scoped `LtPaginatorService`, 0-based `pageNo` + `pageSize` requests, `{data, page: PageDTO}`
  responses (total records, total pages, current page, page size), page change, page-size change that
  returns to page 1, filter change that returns to page 1, and independent pagination for several
  paged lists on one page (one pagination state/service per list). Includes UI spec, host templates
  (single and multi list), a per-list state service, bug patterns and a spec. MUST be loaded when
  adding or changing paging on any Lifetrenz list, when a page needs two or more independent
  paginators, or when diagnosing wrong totals/pages/leaking page state.
---

# Pagination Skill

Parent: `../global-filter-pagination-skill/SKILL.md` (HTTP contract, backend SQL/Mongo, QA).
Filter panel: `../global-filter-skill/SKILL.md`.
Reference (verified 2026-10-27): `lifetrenz-core/src/app/lt-components/lt-pagination/*`, `src/app/data/service/lt-paginator.service.ts`, `src/app/data/model/page-dto.ts`;
hosts `AllAppointmentsComponent` (FDM, `paginate` L3294 / `noOfRecordChange` L3298 / `onSearch` L3410 / result L7276), `AllAdmittedPatientsComponent` (ADT).
Backend payload: `AppointmentPagedDTO{ data, page: PageDTO }` (ipd-service).

## Rules (all screens, no exceptions)

1. **Never** raw `<p-paginator>` in a feature. Always `<lifetrenz-lt-pagination>`; it carries the standard placement, report text, size dropdown and reset-to-page-1 behaviour.
2. **Placement**: inside the table's footer template, one full-width cell, centred:
   `<ng-template pTemplate="footer"><tr><td colspan="N" class="text-center"><lifetrenz-lt-pagination …/></td></tr></ng-template>` (reference `all-appointments.component.html` L724-737).
3. **Provider**: `LtPaginatorService` in the host component's own `providers: [...]` (it is `providedIn: 'root'` – without re-provision the page shares state with every other page).
4. **Page numbers are 0-based end to end**: send `pageNo = <PrimeNG page index>`; never `+1`. Param names are `pageNo`, `pageSize` (not `noOfRecord`).
5. **Defaults**: `pageSize 15`; options `15, 25, 50, 75, 100` (service `noOfRecordOptions`); BE clamps `1..100`.
6. **Response**: `result.data` → rows; `result.page` → `PageDTO { totalPages, currentPageNo, currentPageSize, total }` → bind to the paginator (`selectedPage`). The paginator shows `total` and computes pages from `rows`; `currentPageNo/currentPageSize` are informational (`currentPageSize` = rows on this page).
7. **Page-size change → page 1** (component resets itself, host refetches once). **Filter/search/clear/apply-saved → page 1** (host sets `paginator.first = 0` before the fetch; one request).
8. `loading=false` in both `onResult` and `onError`; empty set shows the table's `emptymessage`.
9. **No client-side paging** of a fully fetched array for lists that can grow.
10. **Several paged lists on one page ⇒ each list has its own state** (own page number, size, `PageDTO`, fetch method, and its own paginator reference). Use `ListPaginationState` / a per-list service — see `reference/multi-instance.md`. Do not share `paginatorService.selectedPage` between lists.

## What the component does (do not re-implement)

`LtPaginationComponent` (selector `lifetrenz-lt-pagination`, standalone):
- Outputs: `(pageChange)` = raw PrimeNG `onPageChange` event (`{page, first, rows, pageCount}`); `(noOfRecordChange)` = the chosen option `{value}`.
- Input: `[selectedPage]: PageDTO | null` — page metadata for **this instance**; falls back to `paginatorService.selectedPage`.
- Local `selectedNoOfRecord` (per instance, starts at 15); changing it calls `paginator.changePageToFirst` (with a guard so the stale-rows re-emit is swallowed) then emits `noOfRecordChange(value)`.
- `goToPage(i)` programmatic navigation (suppresses the next `pageChange`).
- `ngOnInit`: `paginatorService.paginator = <its p-paginator>` — **the last instance created wins** on a shared service.
- Template: `div.flex.col-12.p-0.justify-content-center` › `p-paginator` (`[rows]`, `[totalRecords]="effectivePage?.total ?? 0"`, `showCurrentPageReport`, report `"{totalRecords} records,  {totalPages} pages in total"` translated) + `p-dropdown.p-3` (options 15…100, `optionLabel="value"`, `appendTo="body"`).

## Workflow

1. Single list? → `templates/host-single.md.tpl`. Two or more lists on one page (tabs, split views, master/detail queues)? → `templates/host-multi.md.tpl` + `templates/list-pagination-state.ts.tpl`.
2. Backend: parent skill `templates/be/*` (paged DTO, SQL builder, controller defaults).
3. Wire handlers, response binding, reset-on-filter.
4. Run the checks below + `reference/bug-patterns.md`.

## Verify (all must hold)

- [ ] Page 2 request has `pageNo=1`; page 1 has `pageNo=0`; row sets disjoint; `total` identical
- [ ] Size 15→50: request `pageSize=50&pageNo=0`; dropdown shows 50; footer shows page 1
- [ ] On page 3 apply a filter: lands on page 1; **one** request
- [ ] Footer text `"<total> records,  <pages> pages in total"`; 0 rows → `0 records`
- [ ] Navigating between two screens never shows the previous screen's page/size
- [ ] Multi-list: changing list A's page/size never changes list B's totals or requests

## Files

| File | What |
|---|---|
| `reference/ui-spec.md` | Exact markup, bindings, placement, behaviour, state diagram |
| `reference/multi-instance.md` | Why the shared service breaks with several paginators; per-list state design |
| `reference/bug-patterns.md` | Symptoms → cause → fix |
| `templates/host-single.md.tpl` | single-list host (TS + HTML) |
| `templates/host-multi.md.tpl` | multi-list host (TS + HTML) |
| `templates/list-pagination-state.ts.tpl` | per-list state class / per-list injectable |
| `templates/list-pagination-state.spec.ts.tpl` | spec |
