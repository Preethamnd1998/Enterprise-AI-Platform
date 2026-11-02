# Source Map + Where Docs and Source Disagree

Verified 2026-10-27 against local clones under `/Users/preetham/Lifetrenz/Projects` and GitLab `development`.

## 1. Source map

| Layer | File | Symbols |
|---|---|---|
| UI filter panel | `front-desk-management/src/lib/search/searchbar-all-appointment/searchbar-all-appointment.component.{ts,html,scss}` (GitLab project 232; also under `lifetrenz-core/projects/front-desk-management/…`) | `SearchbarAllAppointmentComponent` |
| UI shared form/state | `…/src/lib/service/all-appointment.service.ts` | `AllAppointmentService` (`appointmentForm`, `time[]`, `selectedIndex`, `selectedTime`, `componentFilterList`, `setFilterFormValues`, `checkDateFormValue`, `updateChipValues`) |
| UI saved-filter client | `…/src/lib/service/conponent-search.service.ts` | `ConponentSearchService` (sic spelling) |
| UI list host | `…/src/lib/appointment/all-appointments/all-appointments.component.{ts,html}` | `setupSearch` L1025, `handleSearch` L1077, `handleTopBarSearch` L1098, `callAppointment` L3080, `paginate` L3294, `noOfRecordChange` L3298, `onSearch` L3410, result handler L7276 |
| UI overlay host | `…/src/lib/fdm-main/fdm-main.component.{ts,html}` | `<p-overlayPanel #searchOP>` + `<router-outlet name="searchbar">` |
| UI event bus | `lifetrenz-core/src/app/layout/service/search-menu.service.ts` | `SearchMenuService` |
| UI top bar | `lifetrenz-core/src/app/layout/app.topbar.component.{html,ts}` | search box, date label, `toggleArrow` |
| UI date util | `lifetrenz-core/src/app/base/util/artifact-utils.ts` L692 | `getDateTimeFromRange` |
| UI pagination | `lifetrenz-core/src/app/lt-components/lt-pagination/lt-pagination.component.{ts,html,css}` | `LtPaginationComponent` |
| UI paginator state | `lifetrenz-core/src/app/data/service/lt-paginator.service.ts`, `…/data/model/page-dto.ts` | `LtPaginatorService`, `PageDTO` |
| UI filter models | `patient-lib/src/lib/data/model/{shared-filter-dto,filter-component-type,filter-level}.ts` | `SharedFilterDto`, `FilterComponentType`, `FilterLevel` |
| BE controller | `ipd-service/…/ipd/opd/appointment/controller/AppointmentController.java` L442 | `getallAppointment` |
| BE service | `…/appointment/service/impl/AppointmentServiceImpl.java` L580 | builds `PageDTO` |
| BE repo | `…/appointment/repository/OPDAppointmentRepository.java` L113 | `getAllAppointments` (RowMapper + `PageImpl`) |
| BE SQL | `…/appointment/query/SQL.java` L128 | three-stage CTE |
| BE DTO | `…/appointment/dto/AppointmentPagedDTO.java`, `…/appointment/dto/PageDTO.java` (+ twin in `…/billing/dto/PageDTO.java`) | `{data, page}` |
| BE saved filter | `…/opd/search/{controller/OPComponentFilterController,service/impl/OPComponentFilterServiceImpl,query/FilterSQL,dto/ComponentFilterDto}.java` | `/opd/component/filter*` |
| BE Mongo primitives | `ipd-clinical-service/…/ehr/service/impl/{CaseSheetServiceImpl L3387,MewsServiceImpl L863}`, `common/dto/{PageRequest,PageResponse}.java` | skip/limit, own page DTOs |

## 2. Discrepancies (this skill follows the **source**)

| # | Document says | Source says | Skill does |
|---|---|---|---|
| 1 | `standards/frontend/pagination.md`: `this.paginatorService.selectedPage = result.pageDTO` | `AppointmentPagedDTO.page`; host `result?.page` | `result.page` |
| 2 | standards: `paginate(event){ loadPage(event.page, …) }` | reference reads `paginatorService.paginator.getPage()` and sets `noOfRecord = event.rows` | single list: reference style; multi list: per-list state (pagination-skill) |
| 3 | standards example `LtPaginationComponent` has `[selectedPage]` always | optional input; falls back to the service | bind `[selectedPage]` always |
| 4 | knowledge/§8 & `rules/security.md`: "bind all params, never concatenate" | sql-query.md (the stated standard): literal string-built SQL is deliberate; only raw Strings must be validated | follow sql-query.md; strings validated/`SqlSafe` (flagged) |
| 5 | knowledge: "default 0-based, `sortBy` supported" | native SQL hard-codes `ORDER BY CREATED_DATE DESC`; `sortBy` ignored | omit or whitelist `sortBy` |
| 6 | `lt-pagination.component.ts` `styleUrls: ['./lt-pagination.component.css']` vs knowledge "scss" | file is `.css` | n/a (consume only) |
| 7 | knowledge: `LtPaginatorService` `noOfRecord` is the HTTP param | HTTP param is `pageSize` | `pageSize` |
| 8 | knowledge: one `FilterComponentType` per page | enum has 140+ members; BE has its own `FilterComponentType` (`…core.search.enums`) | add to **both** |

## 3. Reference defects — do not replicate

- `searchbar-all-appointment.component.ts`: `console.log(form.value)` in `saveFilter`; typo class `p-button-sucess`;
  commented-out blocks; unused imports/chat-panel SCSS (`.kpi-value`, `.circle`…). Template files drop them.
- `SQL.getAllAppointments` / `FilterSQL.getComponentFilter`: raw-String concatenation (`patientNameMpi`, `tokenNumber`,
  `startDate/endDate`, `type`).
- `getComponentFilter` ignores `level` and `siteId` in SQL (only type + user + business) — behaviour to confirm per screen.
- `OPDAppointmentRepository.PhysioApptResponseDTO` paged query never sets `total` (always 0).
- `PageRequest.java` (ipd-clinical) javadoc counts after applying skip/limit.
- `initializeForm()` seeds `rangeDate: [this.rangeDates]` where `rangeDates` is undefined → `[undefined]`;
  host sets today later. The template initialises `[new Date(), new Date()]` explicitly.
