---
name: global-filter-pagination-skill
description: |
  Master skill for building a filterable, paginated list screen the Lifetrenz way: the top-bar
  "global filter" panel (time-range chips + custom From/To dates + field filters + Save Filter /
  default filter), the custom `<lifetrenz-lt-pagination>` footer, and the backend that serves
  both (Spring Boot, PostgreSQL via custom string-built `SQL` classes in the sql-query.md format,
  or MongoDB via Query/Aggregation) returning the canonical `{ data, page: PageDTO }` payload.
  Owns the end-to-end contract, backend templates, the SQL-format rules and the list of known
  doc-vs-source discrepancies; delegates UI detail to the two sub-skills
  `global-filter-skill` and `pagination-skill`. MUST be loaded by any agent or developer asked to
  add a searchable/filterable/paginated list, a saved/default filter, or a paginated API to any
  Lifetrenz Angular app + Spring service, or to review/port such a screen.
---

# Global Filter + Pagination — Master Skill

Reference screen (source of truth, clone it, don't redesign it): **All Appointments**
(`front-desk-management`) + `ipd-service` `GET /opd/all/appointment`.
Everything below was verified against source on 2026-10-27 unless tagged **UNVERIFIED**.

## Sub-skills (load the one(s) you need)

| Need | Skill | Path |
|---|---|---|
| Filter panel, search, save/default filter, time range | `global-filter-skill` | `../global-filter-skill/SKILL.md` |
| Footer pagination, page size, multiple paginators per page | `pagination-skill` | `../pagination-skill/SKILL.md` |
| Backend (paged DTO, SQL/Mongo, controller, filter API) | this skill | `reference/` + `templates/be/` |

A normal list screen needs **all three**. Pagination-only screens (no filter panel) load
`pagination-skill` + this skill's backend part.

## Which "search" are you building? (decide first — three different subsystems exist)

| Requirement | Shape | Use |
|---|---|---|
| Filter **my own list** with panel, saved/default filters | page-specific FDM filter panel | **this skill + global-filter-skill** |
| Header quick-search box (free text) for my page | per-page `searchDataEvent$` subscriber | global-filter-skill §quick-search |
| Find an existing **patient** anywhere | Core `GET /core/patient/list/{customerBusinessId}` | call it; do not rebuild (`shared/knowledge/custom-flows/pagination-global-filter/Global-Filter-Search-Architecture.md` §2c) |

## End-to-end picture

```
Top bar (app.topbar)  ──toggle arrow──▶ SearchMenuService.searchBarToggleEvent$
                                         │
Module shell (e.g. FdmMainComponent) ◀───┘  p-overlayPanel (480px, appendTo body)
   └─ <router-outlet name="searchbar">  ← aux route renders  app-searchbar-<feature>
                                              │ edits shared root-service FormGroup
                                              │ Search ⇒ SearchMenuService.updateSearchBarViewEvent(SearchFilterEvent)
List page (host) ◀── searchBarViewEvent$ ─────┘  handleSearch(): reset paginator.first=0 → fetch
   ├─ <lifetrenz-lt-pagination>  (pageChange / noOfRecordChange) → fetch(pageNo 0-based, pageSize)
   └─ GET /<svc>/<list>?pageNo&pageSize&<filters>  →  { data: T[], page: PageDTO }
Saved filters: ConponentSearchService ⇄ /opd/component/filter  (JSON blob of the form)
```

## Non-negotiable contracts (one line each; detail in `reference/end-to-end-contract.md`)

1. **0-based paging end to end.** UI sends PrimeNG's raw page index as `pageNo`; never `+1`.
2. **Params are `pageNo` + `pageSize`** (not `noOfRecord`). UI defaults 15; options 15/25/50/75/100.
3. **Response is `{ data: T[], page: PageDTO }`** where `PageDTO = { totalPages, currentPageNo, currentPageSize, total }`.
   The UI reads `result.data` and `result.page`. (The standards file's `result.pageDTO` is wrong — see discrepancies.)
4. **Filter change ⇒ back to page 0 ⇒ one fetch.** Page-size change ⇒ page 0 (the component does it).
5. **Default time range = Today** when the screen has a date filter and no default saved filter;
   a saved **default filter** (one per user+page) wins. Screens without a date filter send no date
   params and the backend returns the **most recent first** (deterministic `ORDER BY … DESC, id DESC`).
6. **Backend data is always a custom SQL string** built in a `*.query.SQL` class in the sql-query.md
   format (Postgres) — or the Mongo equivalent. No Spring-Data derived queries, no `findAll(Pageable)`.
7. **Component-scoped `LtPaginatorService`** in every host's `providers`; never rely on the root singleton.
8. **Each saveable-filter screen gets its own `FilterComponentType` enum member** (UI model + BE enum).

## Workflow

1. **Scope**: list screen name, owning UI library/app, owning BE service, DB (Postgres / Mongo),
   has date range? which filter fields? one list or several on the page?
2. **Verify schema** against the live DB via the right `mcp__*-db__query` before writing SQL
   (sql-query.md rule). If unreachable, say so and mark SQL "unverified schema".
3. **Backend**: generate from `templates/be/*` — PageDTO + `<Feature>PagedDTO`, controller, service,
   repository, `SQL` builder (Postgres) or Mongo repository. Read `reference/be-sql-format.md`
   (or `be-mongo-format.md`) first. Add `FilterComponentType` member (BE enum + UI enum).
4. **UI filter**: follow `global-filter-skill` (searchbar component, shared form service, host wiring, routing).
5. **UI pagination**: follow `pagination-skill` (footer, handlers, multi-instance rule).
6. **Prove**: run `reference/qa-checklist.md` (both gates: completeness + regression). Manual page-1 vs
   page-2 request; change filter on page 3 → lands on page 1; page-size change → page 1.
7. Load standards lazily: `coding-standards.md`; backend `controller.md`, `service.md`, `repository.md`,
   `sql-query.md`, `dto-mapper-enum.md`; frontend `component.md`, `service.md`, `custom-components.md`,
   `global-filter-search.md`, `pagination.md`. Use only the ones the change touches.

## Hard rules

- Never string-concatenate a raw `String` into SQL. Longs/Integers/Booleans/enums may be concatenated
  (sql-query.md); dates are **parsed to `LocalDate/LocalDateTime` and re-formatted**; free text goes
  through `SqlSafe` (template) — see `reference/be-sql-format.md` §3. The reference `SQL.java` /
  `FilterSQL.java` still concatenate raw strings in places: **do not copy those parts**.
- Count and data must share one WHERE (count-as-column CTE). Never a second hand-copied filter.
- Every paged query has a deterministic ORDER BY with a unique tiebreaker.
- UI uses only the custom components: `<lifetrenz-lt-pagination>`, the searchbar pattern,
  PrimeNG modules already used by the reference. No raw `<p-paginator>` in features.
- Cross-module import rules still apply (e.g. emergency must not import `@inpatient`) — copy locally.
- No PHI in filter names, logs or saved `formValue` beyond what the form already holds.
- 10+ file edits in one turn ⇒ pause per kernel §17.

## Files in this skill

| File | What |
|---|---|
| `reference/end-to-end-contract.md` | HTTP params, response, defaults, date handling, error/empty states |
| `reference/be-sql-format.md` | Postgres SQL-builder rules, CTE pagination, safe binding of strings |
| `reference/be-mongo-format.md` | Mongo equivalent producing the same `{data,page}` |
| `reference/source-map-and-discrepancies.md` | Real file paths + where standards/knowledge disagree with source |
| `reference/qa-checklist.md` | Completeness + regression checklist |
| `templates/be/*.tpl` | PageDTO, PagedDTO, controller, service, repository, SQL builder, Mongo repo, SqlSafe |
