# PAGINATION — UI + BACKEND ARCHITECTURE KNOWLEDGE

Status: Built from direct source inspection (2026-08-26) of Lifetrenz-Core, FDM, ADT,
Inpatient, ipd-service and core-service. Every fact below is tagged VERIFIED (read in
source) or INFERRED/UNVERIFIED (pattern-matched, not directly opened). Do not treat
INFERRED facts as certain. This file is optimized for AI retrieval/code-generation, not
human tutorial reading.

Companion file: `Global-Filter-Search-Architecture.md` (search bars, saved filters,
quick time-range filters — a DIFFERENT subsystem from pagination, do not conflate).

---

## 1. ENTITIES

```
ENTITY: LtPaginationComponent
TYPE: Shared standalone Angular UI component
FILE: UI-BE/lifetrenz-core/src/app/lt-components/lt-pagination/lt-pagination.component.ts
SELECTOR: lifetrenz-lt-pagination
RESPONSIBILITY: Render a PrimeNG p-paginator + page-size dropdown; translate PrimeNG's
  raw paginator events into two typed outputs the host page reacts to.
STATE OWNED BY THIS COMPONENT INSTANCE (per Angular component-instance rules, always
  per-instance regardless of DI scope):
  - selectedNoOfRecord: {value:number}  — the page-size currently shown in the dropdown
  - isProgrammaticPageChange: boolean   — suppresses pageChange re-emit on goToPage()
INPUTS:
  - selectedPage: PageDTO | null  (optional; see PATTERN "per-instance page data" below)
OUTPUTS:
  - pageChange: EventEmitter<any>       — raw PrimeNG p-paginator onPageChange event
  - noOfRecordChange: EventEmitter<any> — the newly selected {value:number} option
PUBLIC METHODS:
  - paginate(event) — re-emits pageChange unless the page change was programmatic
  - changeNoOfRecord(event) — updates local selectedNoOfRecord, resets paginator to
    page 1 via `paginator.changePageToFirst(...)`, emits noOfRecordChange
  - goToPage(pageIndex) — programmatically drives the underlying p-paginator
```

```
ENTITY: LtPaginatorService
TYPE: Angular injectable service
FILE: UI-BE/lifetrenz-core/src/app/data/service/lt-paginator.service.ts
DECORATOR: @Injectable({ providedIn: 'root' })   <-- VERIFIED, see PAGINATION_STATE_SCOPE
FIELDS:
  - paginator: Paginator            (PrimeNG paginator ViewChild reference)
  - selectedPage: PageDTO           (legacy/fallback page metadata holder)
  - noOfRecord: any = 15            (legacy/fallback page-size holder, default 15)
  - pageNo: any = 1                 (present but NOT read by the verified flows below —
                                      real page number is read from paginator.getPage())
  - noOfRecordOptions: NoOfRecord[] = [{15},{25},{50},{75},{100}]   <-- VERIFIED DEFAULTS
```

```
ENTITY: PageDTO (Angular)
FILE: UI-BE/lifetrenz-core/src/app/data/model/page-dto.ts
FIELDS: totalPages:number, currentPageNo:number, currentPageSize:number, total:number
MIRRORS EXACTLY: com.lifetrenz.lths.ipd.billing.dto.PageDTO (Java, ipd-service) — same
  4 fields in the same order. VERIFIED field-for-field match.
```

```
ENTITY: PageDTO (Java, shared IPD/Billing package)
FILE: ipd-service/src/main/java/com/lifetrenz/lths/ipd/billing/dto/PageDTO.java
FIELDS: totalPages:int, currentPageNo:int, currentPageSize:int, total:Long
CONSTRUCTION (verified call site, AppointmentServiceImpl:582):
  new PageDTO(pageResult.getTotalPages(), pageResult.getNumber(),
              pageResult.getNumberOfElements(), pageResult.getTotalElements())
NOTE: currentPageSize = getNumberOfElements() = actual rows returned on THIS page,
  NOT the requested pageSize. On the last (partial) page these differ. Do not read
  currentPageSize as "the page-size the caller asked for".
```

---

## 2. UI ARCHITECTURE (PAGINATION_UI_PATTERN)

FLOW: LtPaginationComponent internal wiring
```
p-paginator (PrimeNG) --(onPageChange)--> LtPaginationComponent.paginate(event)
  --> emits (pageChange) to host, UNLESS goToPage() just drove this change
      programmatically (isProgrammaticPageChange guard)

p-dropdown (page-size) --(onChange)--> LtPaginationComponent.changeNoOfRecord(event)
  --> sets local selectedNoOfRecord (per-instance, NOT paginatorService.selectedNoOfRecord)
  --> paginator.changePageToFirst(...)   // always resets to page 1 on size change
  --> emits (noOfRecordChange) with the new {value:number}
```

FLOW: Host feature component wiring (VERIFIED — AllAppointmentsComponent, and the same
shape repeated in AllAdmittedPatientsComponent, MyPendingQComponent, IpDnfbComponent, …)
```html
<lifetrenz-lt-pagination
  #paginator
  (pageChange)="paginate($event)"
  (noOfRecordChange)="noOfRecordChange($event)"
></lifetrenz-lt-pagination>
```
```ts
paginate(event: any): void {
  this.paginatorService.noOfRecord = event.rows;
  this.onSearch(event);              // re-fetch with new page index
}
noOfRecordChange(eve): void {
  this.paginatorService.noOfRecord = eve.value;
  this.onSearch(true);               // re-fetch — paginator already reset to page 1
}
```
Page number sent to the backend is NOT taken from the pageChange event — it is read
live from `paginatorService.paginator.getPage()` at call time (see
AllAppointmentsComponent.callAppointment(), line ~2550):
```ts
ArtifactUtils.isNull(this.paginatorService?.paginator?.getPage())
  ? 0
  : this.paginatorService?.paginator?.getPage()
```
`Paginator.getPage()` is PrimeNG's own zero-based current-page index — this is the
source of truth for "what page are we on", not a locally tracked counter.

RESPONSE HANDLING (VERIFIED, HIS_ALLAPPOINTMENT_GET result handler):
```ts
this.scheduleAppointmentService.allAppointments = result?.data;
this.paginatorService.selectedPage = result?.page;   // PageDTO from the API response
```
The paginator's `[totalRecords]` binding reads `effectivePage?.total ?? 0`, where
`effectivePage` getter = `this.selectedPage ?? this.paginatorService.selectedPage`
(component @Input wins if bound, else falls back to the shared/scoped service).

Loading/error state: VERIFIED that these pages use ad-hoc boolean flags on the host
component (`isLoading`, `isSkeletonLoad`, `loading`) set/cleared around the API call —
there is no dedicated loading/error state on LtPaginatorService or LtPaginationComponent
itself. Skeleton/spinner visibility is entirely the host page's responsibility.

## 2b. PAGE-NUMBERING CONVENTION (VERIFIED, cross-checked UI+BE)

- UI: PrimeNG `Paginator.getPage()` → **zero-based**.
- Backend controller default: `@RequestParam(defaultValue = "0") Integer pageNo` →
  **zero-based**.
- Backend: `PageRequest.of(pageNo, pageSize, ...)` (Spring Data) → Spring Data
  `Pageable`/`Page` is natively **zero-based** (`getNumber()` returns 0 for page 1).
- CONCLUSION: the entire stack is consistently zero-based, UI to DB. There is no
  UI-to-BE off-by-one translation anywhere in the verified flow. If you ever see a
  page number sent as 1-based from a NEW page's UI code, that is a deviation from the
  established convention — treat it as a bug, not a stylistic choice.

## 2c. DEFAULT PAGE SIZE AND OPTIONS (VERIFIED)

- UI default options: **15, 25, 50, 75, 100** (`LtPaginatorService.noOfRecordOptions`,
  first entry `{value:15}` used as the initial `selectedNoOfRecord` in
  `LtPaginationComponent`'s constructor).
- Backend controller-level default (used only when the UI omits the param, which the
  reference flow never does): `pageSize` defaults to **10** on
  `AppointmentController.getallAppointment` and **100** on
  `PatientController.getPatients`. These two backend defaults are NOT the same number
  — do not assume a single global default page size across services.

---

## 3. PAGINATION_STATE_SCOPE — THE SINGLETON QUESTION (read this before adding
    pagination to any new page)

**VERIFIED FACT:** `LtPaginatorService` is declared `@Injectable({ providedIn: 'root' })`.
By itself, that means Angular would hand out ONE shared instance app-wide — every page
that injects it without further action would silently share `selectedPage`, `noOfRecord`
and (critically) the `paginator` ViewChild reference with every other such page.

**VERIFIED FACT:** every real feature page that uses `LtPaginationComponent` neutralizes
this by re-declaring `LtPaginatorService` in its OWN component's `providers: [...]`
array. Angular's DI resolves a token from the nearest injector that declares it; a
component-level `providers` entry creates a fresh instance for that component's own
subtree, shadowing the root singleton for everyone under it. Verified in:
  - `AllAppointmentsComponent` (FDM) — `providers: [..., LtPaginatorService, ...]`
  - `SearchbarAllAppointmentComponent` (FDM) — same
  - `MyPendingQueueComponent` (Inpatient, shell) — same
  - `AllAdmittedPatientsComponent` (ADT) — same
  - grep across `projects/` shows 250+ feature components following this same shape.

**This component-level re-provision is THE mechanism that gives each PAGE its own
pagination state.** It is not automatic — a new page MUST declare
`providers: [LtPaginatorService]` on its own `@Component`, or it silently falls back to
the app-wide root singleton and will corrupt/steal state from whichever other page last
touched it (see ANTI-PATTERN below).

### 3a. Multiple pagination instances WITHIN one page/component (NOT a singleton problem)

A single page/component can legitimately render **more than one**
`<lifetrenz-lt-pagination>` (verified: `all-admitted-patients.component.html`,
`ip-dnfb.component.html`, `emergency-registration.component.html`, and 15+ others each
contain 2 or more instances in the same template). Because `LtPaginationComponent` does
NOT declare its own `providers`, every instance inside one page resolves the SAME
`LtPaginatorService` instance (the one that page's own component provided). Two problems
follow if nothing further is done:
  1. `ngOnInit(): this.paginatorService.paginator = this.paginator` — the LAST
     `LtPaginationComponent` instance to init overwrites `paginatorService.paginator`,
     so an earlier instance's `#paginator` ViewChild reference is lost from the shared
     service.
  2. `paginatorService.selectedPage` / `noOfRecord` would be a single shared value —
     one list's page-size change would visually change another list's reported total.

VERIFIED fix, present in the component source itself (see comments in
`lt-pagination.component.ts`):
  - `@Input() selectedPage: PageDTO | null` — when bound, the component reads/display
    its OWN page metadata instead of the shared `paginatorService.selectedPage`, via
    `effectivePage = this.selectedPage ?? this.paginatorService.selectedPage`.
  - `selectedNoOfRecord` is a plain component field (not read from the service) — always
    per-instance by construction, so the page-size dropdown of one queue never mutates
    another queue's dropdown.
  - The `[selectedPage]` input is sourced from wherever the host page keeps that
    specific list's `PageDTO` — either a component-local field, or (VERIFIED,
    `ip-dnfb.component.html`) a dedicated feature service field:
    `[selectedPage]="searchIpDnfbService.pageData"` (`SearchIpDnfbService.pageData`,
    populated from `result?.page` on that list's own API response).

**PATTERN — "N paginated lists in one page":**
```
For each independent list on the page:
  1. Give that list's data + PageDTO a distinct home (a component field OR a small
     per-list feature service field) — never paginatorService.selectedPage for more
     than one list.
  2. Bind that list's <lifetrenz-lt-pagination> with
     [selectedPage]="thatList'sOwnPageDTO"
  3. Give each instance its own (pageChange)/(noOfRecordChange) handler methods (or a
     shared handler parameterised by which list fired it) that call THAT list's fetch
     method — never a single generic handler that assumes one list.
  4. LtPaginatorService itself can stay shared for the page (it still only holds
     noOfRecordOptions + the last-attached #paginator ViewChild) — the actual per-list
     truth lives in the [selectedPage] source, not in the service.
```

### 3b. ANTI-PATTERN — root-scoped leakage

```
ANTI-PATTERN: Root-scoped LtPaginatorService
DESCRIPTION: A new feature component injects LtPaginatorService via constructor but
  does NOT list it in its own @Component({ providers: [...] }).
CONSEQUENCE: Angular resolves the app-wide root singleton. Symptoms:
  - Navigating from Page A to Page B shows Page A's last page number / page size.
  - Page B's paginator ViewChild silently overwrites Page A's if both are mounted
    simultaneously (e.g. tabs, split views, wizard steps).
  - `MyPendingQueueComponent.activeItem()` resets `paginatorService.selectedPage = null`
    on ITS OWN scoped instance — but its routed children (`MyPendingQComponent`,
    `SignAndFinalizeComponent`) each re-provide their OWN LtPaginatorService instance,
    so that reset has NO EFFECT on the children's state. (VERIFIED source pattern —
    flag this shape as dead/ineffective code if seen elsewhere: a parent resetting a
    service that its children have already re-scoped away from it.)
VERIFICATION STEPS: open the suspect component's .ts, check the @Component decorator's
  `providers` array for `LtPaginatorService`. If absent, and the component's template
  hosts `<lifetrenz-lt-pagination>`, this is the anti-pattern.
FIX: add `LtPaginatorService` to that component's own `providers` array.
```

---

## 4. PAGINATION_API_CONTRACT (UI → API, VERIFIED end-to-end on the reference flow)

Reference flow: All Appointments list.
```
FeatureComponent(AllAppointmentsComponent).callAppointment()
  --> ScheduleAppointmentService.getAllappointments(callback, siteId, pageSize, pageNo,
        startDate, endDate, genderId, displayEncounterNumber, mobileNumber, visitTypeId,
        payerTypeId, appointmentTypeId, journeyStatusCode, patientNameMpi, physicianId,
        dateOfBirth, specialization, serviceType, tokenNumber, appointmentTime,
        roleIdentifier, appointmentCategoryType, isWaitingList)
  --> HttpParams: siteId, pageSize, pageNo, startDate, endDate, genderId,
        displayEncounterNumber, mobileNumber, roleIdentifier, visitTypeId, payerTypeId,
        journeyStatusCode, patientNameMpi, physicianId, dateOfBirth, specialization,
        serviceType, tokenNumber, appointmentTypeIdentifier, isWaitingList,
        (+ optional appointmentTime, appointmentCategoryType)
  --> GET ipd-service /opd/all/appointment   (ScheduleApiConstant.HIS_ALLAPPOINTMENT_GET)
```
Backend (VERIFIED, `AppointmentController.getallAppointment`):
```java
@RequestParam(defaultValue="10") Integer pageSize
@RequestParam(defaultValue="0")  Integer pageNo
@RequestParam(defaultValue="id") String  sortBy      // accepted but see BUG_PATTERN below
```
Response body (VERIFIED, `AppointmentPagedDTO`):
```java
class AppointmentPagedDTO { List<AllAppointmentDTO> data; PageDTO page; }
```
UI unwrap (VERIFIED):
```ts
this.scheduleAppointmentService.allAppointments = result?.data;
this.paginatorService.selectedPage = result?.page;
```
**This `{ data: T[], page: PageDTO }` shape is the canonical paged-response contract for
this codebase's native-SQL paginated endpoints** (also seen, with an `ApplicationResponse`
outer wrapper, in core-service's `PatientPageDTO` — see PAGINATION_DATABASE_PATTERN §C).
There is no generic Spring HATEOAS `PagedModel` / raw `Page<T>` JSON returned directly to
the UI anywhere in the verified flows — the paging metadata is always flattened into an
app-specific PageDTO.

---

## 5. PAGINATION_BACKEND_PATTERN (three distinct, verified patterns coexist — pick based
    on what the query already looks like, don't invent a fourth)

### Pattern A — JPA derived-query, Page<T> (simplest; use for a plain single-table list)
```
ENTITY: IAdmissionRepository
FILE: ipd-service/.../domain/repository/admission/IAdmissionRepository.java
Page<Admission> findBySiteIdAndActiveTrue(@Param("siteId") Long siteId, Pageable pageable);
```
Spring Data builds the query, the COUNT query, and applies LIMIT/OFFSET automatically.
Use this when the list is a simple filter over one entity/table and you don't need
hand-tuned SQL.

### Pattern B — Native SQL, single query, count-as-a-column (VERIFIED, the "IPD"
    reference example named in this task's own scope)
```
ENTITY: OPDAppointmentRepository.getAllAppointments()
FILE: ipd-service/src/main/java/com/.../ipd/opd/appointment/repository/OPDAppointmentRepository.java
QUERY BUILDER: ipd-service/.../ipd/opd/appointment/query/SQL.java :: getAllAppointments()
```
Shape (VERIFIED, SQL.java):
```sql
WITH BASE_FILTERED AS ( SELECT APT.ID, APT.CREATED_DATE FROM ... WHERE <all filters> ),
     TOTAL_COUNT   AS ( SELECT COUNT(*) AS total FROM BASE_FILTERED ),
     BASE          AS ( SELECT ID FROM BASE_FILTERED
                         ORDER BY CREATED_DATE DESC
                         LIMIT <pageSize> OFFSET <offset> )
SELECT TC.total, <60+ enrichment columns via LATERAL joins>
FROM BASE B CROSS JOIN TOTAL_COUNT TC JOIN APPOINTMENT APT ON APT.ID = B.ID ...
```
- `LIMIT`/`OFFSET` are Java string-concatenated from `paging.getPageSize()` /
  `paging.getOffset()` (i.e. `Pageable` is used only as a value source, Spring Data does
  NOT apply it automatically to a `JdbcTemplate` query — you must do this yourself).
- Total count is computed ONCE (`TOTAL_COUNT` CTE) and joined onto every returned row
  (`CROSS JOIN TOTAL_COUNT TC`), then read back in the `RowMapper` via
  `totalCount[0] = rs.getLong("total")` and passed into
  `new PageImpl<>(rows, paging, totalCount[0])`. This avoids a second round-trip count
  query while still giving Spring's `Page<T>` an accurate `getTotalElements()`.
- Comment inside the file explains WHY this 3-stage CTE shape exists: an earlier
  version used a full-table window function and took 27s; filtering once into a
  lightweight `BASE_FILTERED` CTE before enriching only the `pageSize` rows fixed it.
  **Design implication for new pages:** if a list needs many joined/derived columns,
  filter+paginate first on a narrow CTE, then enrich only the page's worth of rows —
  don't enrich the full filtered set before paginating.
- Use this pattern when the list needs hand-tuned joins/derived columns that a JPA
  derived query can't express cleanly, but you still want ONE round trip.

### Pattern C — Native SQL, two separate queries: count then data (VERIFIED, core-service
    global patient search)
```
ENTITY: PatientServiceImpl.getPatients() / PatientRepository
FILE: core-service/src/main/java/com/.../core/patient/service/impl/PatientServiceImpl.java
STEPS (verified, lines 684-712):
  Long totalCount = patientRepository.getTotalPatientCount(...);     // query 1
  Page<PatientDTO> pageResult = patientRepository
      .getAllPatientsOptimized(paging, ..., totalCount);              // query 2
  return new PatientPageDTO(pageResult.getContent(),
      new PageDTO((int)Math.ceil((double)totalCount/pageSize),
                  pageResult.getNumber(), pageResult.getNumberOfElements(), totalCount));
```
- Two round trips instead of one, but each query is simpler/cheaper individually and
  can use a different technique per query (see BUG_PATTERN below — here the count query
  and the data query actually use DIFFERENT matching logic, which is a real defect, not
  a deliberate feature of this pattern).
- `totalPages` is computed in Java via `Math.ceil(totalCount / pageSize)`, NOT taken
  from a JPA `Page.getTotalPages()` (since this method never builds a Spring "counted"
  Page — the count is external). If you copy this pattern, remember to do this
  ceiling-division yourself; it's easy to accidentally floor-divide (integer division)
  and undercount the last page.

### D. Which pattern to pick for a NEW list
```
RULE: If the list is a straightforward single/simple-joined-entity filter with no
  hand-written SQL need → Pattern A (JPA derived query, Page<T>).
RULE: If the list needs many joined/derived/JSON-extracted columns but should stay a
  single round trip → Pattern B (native SQL, CTE, count-as-column).
RULE: If the two halves (count vs. data) genuinely benefit from different techniques
  (e.g. full-text ranked search for data, cheap filter-only count) → Pattern C, but
  MUST keep both halves' WHERE-matching logic identical (see BUG_PATTERN — this is
  exactly where Pattern C in this codebase currently gets it wrong).
RULE: Do not invent a 4th ad-hoc pagination shape for a new endpoint — reuse A, B, or C.
```

---

## 6. PAGINATION_DATABASE_PATTERN — offset/index considerations (VERIFIED)

- Offset is always `pageNo * pageSize`, computed by Spring's `PageRequest.of(...)`
  (Pattern A) or read via `Pageable.getOffset()` and string-concatenated into raw SQL
  (Patterns B/C). Zero-based throughout (see §2b).
- **Large-offset cost**: Pattern B's `BASE` CTE does `ORDER BY CREATED_DATE DESC LIMIT n
  OFFSET m` over `BASE_FILTERED` (already narrowed by the WHERE clause) rather than over
  the raw table — this bounds the cost of a large offset to the filtered set, not the
  whole `APPOINTMENT` table. A new endpoint copying this pattern should preserve that
  "filter first in a narrow CTE, then LIMIT/OFFSET" ordering — doing `LIMIT/OFFSET` over
  an unfiltered/unindexed scan is the classic large-offset performance trap.
- **Missing/duplicate rows between pages**: both Pattern B and Pattern A order by a
  concrete column (`CREATED_DATE DESC` / entity default) — a NEW paginated query MUST
  always specify a deterministic `ORDER BY`/`Sort`. An unordered `LIMIT/OFFSET` query can
  return the same row twice or skip rows between two page requests if the underlying
  table is being written concurrently (very plausible here — appointments/admissions are
  live-written tables).

---

## 7. PAGINATION_BUG_PATTERNS (troubleshooting reference)

```
BUG_PATTERN: UI page changes but API page does not change
SYMPTOMS: Clicking page 2 in the UI re-runs the exact same query as page 1.
LIKELY ROOT CAUSE: The fetch method reads a stale/cached page number instead of
  `paginatorService.paginator.getPage()` at call time, OR the (pageChange) handler
  isn't wired to call the fetch method at all.
FILES TO INSPECT: the host component's (pageChange) handler; confirm it calls the same
  fetch method used for filters, and that the fetch method reads getPage() fresh, not a
  field set once in ngOnInit.
VERIFICATION: log `paginatorService.paginator.getPage()` immediately before the HTTP
  call fires.
FIX PATTERN: always read the page number from the live paginator at call time (see §4).
```

```
BUG_PATTERN: Page-size change does not reset to page 1
SYMPTOMS: User is on page 5 of 50/page; switches to 100/page; backend is asked for
  page 5 of 100/page, which may not exist or silently returns page-5-worth of wrong data.
ROOT CAUSE IF MISSING: a new/custom paginator wiring skips
  `paginator.changePageToFirst(...)` inside the page-size-change handler.
VERIFIED CORRECT BEHAVIOR: `LtPaginationComponent.changeNoOfRecord()` already calls
  `this.paginator.changePageToFirst(new Event('change'))` before emitting
  `noOfRecordChange` — if a new page reimplements this from scratch (instead of reusing
  LtPaginationComponent), it MUST replicate this reset-to-page-1 step.
FIX PATTERN: reset to page 1 (client-side reset via paginator, or explicitly send
  pageNo=0) before firing the page-size-triggered fetch.
```

```
BUG_PATTERN: Paginator state leaking between components/pages
SYMPTOMS: Page B shows Page A's page number/size on first load; or two tabs/queues on
  one page fight over which page number is "current".
ROOT CAUSE: LtPaginatorService injected without being re-declared in the consuming
  component's own `providers: [...]` array (falls back to the root singleton) — see
  §3, ANTI-PATTERN.
FILES TO INSPECT: the feature component's `@Component` decorator.
FIX PATTERN: add `LtPaginatorService` to that component's `providers`. If MULTIPLE
  lists live in the same component, additionally give each list its own `[selectedPage]`
  source (§3a) — provider re-scoping alone only isolates page-from-page, not
  list-from-list within one page.
```

```
BUG_PATTERN: Total count always 0 / incorrect
SYMPTOMS: Records display correctly but "0 records" or a wrong total shows in the
  paginator, or the last page appears cut off.
VERIFIED REAL INSTANCE #1 (ipd-service, OPDAppointmentRepository — the
  PhysioApptResponseDTO paged query, distinct from the correct getAllAppointments()):
  its RowMapper never sets `totalCount[0]`, yet the method still returns
  `new PageImpl<>(tempList, paging, totalCount[0])` — so `getTotalElements()` is always
  0 for that endpoint. A source comment explicitly acknowledges this as a pre-existing,
  unfixed bug ("this method's mapper never actually assigns a real total here").
VERIFIED REAL INSTANCE #2 (core-service patient search — see next bug pattern): count
  and data queries can disagree because they search differently.
FILES TO INSPECT: the RowMapper for the query in question — confirm it actually reads a
  `total`/count column into the value passed to `PageImpl`/`PageDTO`.
VERIFICATION: compare `PageDTO.total` in the API response against the actual `data`
  array length across multiple pages; if `total` never changes from 0 while `data` is
  clearly non-empty, the mapper is not setting it.
FIX PATTERN: ensure the SELECT includes the count column (Pattern B) or the dedicated
  count query (Pattern C) actually filters identically to the data query, and that the
  RowMapper reads it into the value that reaches PageDTO.total.
```

```
BUG_PATTERN: Count query and data query disagree (Pattern C specific)
SYMPTOMS: `PageDTO.total` doesn't match how many rows scrolling through all pages
  actually yields for the same search term.
VERIFIED ROOT CAUSE (core-service, PatientRepository / SQL.java): for the SAME
  `nameMpiMobile` search parameter, `getTotalPatientCount()` matches via plain
  `ILIKE '%term%'` OR'd across mpi/external_mpi/name columns, while
  `getAllPatientsOptimized()` (the actual data query) matches via PostgreSQL full-text
  search (`search_vector @@ plainto_tsquery(...)`). ILIKE substring matching and
  tsquery token matching do not always agree on the same input (e.g. partial-word
  substrings, stemming, stopwords) — so the reported total can diverge from the real
  result set size.
FILES: core-service/src/main/java/com/.../core/patient/query/SQL.java — compare the
  `nameMpiMobile` clause inside the count-query method vs. `buildFullTextSearchCondition`.
FIX PATTERN: the count query and the data query for the same filter set MUST use
  identical matching logic — either both ILIKE or both full-text search.
```

```
BUG_PATTERN: Backend/query ignores requested sort
SYMPTOMS: A `sortBy`/`sort` request param is accepted by the controller and appears to
  do nothing.
VERIFIED REAL INSTANCE: `AppointmentController.getallAppointment` accepts
  `sortBy` (default "id") and builds `Sort.by(sortBy)` into the `Pageable`, but
  `SQL.getAllAppointments()` (Pattern B, native SQL) hardcodes
  `ORDER BY CREATED_DATE DESC` and never reads the `Pageable`'s `Sort` at all — the
  `sortBy` parameter is silently ignored end-to-end for this endpoint.
FILES TO INSPECT: for any native-SQL (Pattern B/C) endpoint, check whether the SQL
  builder's ORDER BY clause actually references the `Pageable`'s Sort, or is a fixed
  literal column.
FIX PATTERN: for native SQL pagination, either explicitly translate `Pageable.getSort()`
  into the ORDER BY (with a whitelist of allowed sort columns — never string-concatenate
  a raw client-supplied sort column) or remove the misleading `sortBy` param from the
  API contract if sorting truly isn't supported.
```

```
BUG_PATTERN: Filters reset pagination incorrectly / stale page after filter change
SYMPTOMS: applying a new filter shows an empty page 6 because the previous filter had
  6 pages and this filter only has 1.
VERIFIED HANDLING IN REFERENCE FLOW: `AllAppointmentsComponent.handleSearch()`
  explicitly resets the paginator before re-querying:
  `if (!isNull(paginatorService.paginator) && !isNull(paginatorService.paginator.first))
     { paginatorService.paginator.first = 0; }`
FIX PATTERN: any handler that changes filter criteria (not just page/page-size) must
  also reset the paginator to page 1/offset 0 before firing the fetch — copy the guard
  above rather than assuming the paginator will naturally clamp.
```

---

## 8. ANTI_PATTERNS (pagination-specific, consolidated)

```
ANTI-PATTERN: Using raw <p-paginator> directly in a new feature instead of
  <lifetrenz-lt-pagination>.
WHY: bypasses the noOfRecordOptions standard, the per-instance selectedPage safety net,
  and the page-1-reset-on-size-change behavior — all of which a raw p-paginator does
  not give you for free.
```
```
ANTI-PATTERN: Injecting LtPaginatorService in a new feature component WITHOUT adding it
  to that component's own `providers` array.
WHY: silently binds to the app-wide root singleton (see §3, §3b).
```
```
ANTI-PATTERN: Client-side pagination (slicing an already-fully-fetched array in the
  browser) for a backend list that can grow large (appointments, admissions, patients,
  bills). Every verified reference flow in this codebase fetches one page's worth of
  rows per request — do not fetch "all" rows and paginate them in the template.
```
```
ANTI-PATTERN: String-concatenating request-supplied filter/search values directly into
  native SQL for a paginated query. VERIFIED throughout SQL.java in both ipd-service and
  core-service (e.g. `"AND PS_F.telecom_number ILIKE '%" + mobileNumber + "%'"`,
  `"AND (PS_F.firstname ILIKE '%" + patientNameMpi.trim() + "%'"`, similarly for
  dateOfBirth, tokenNumber, roleIdentifier, emiratesId, journeyStatusCode, siteId).
  This is a genuine SQL-injection surface, not a style nitpick — the org's own
  security standard (`~/.claude/rules/security.md`) requires bound parameters for all
  SQL, "even trusted internal inputs." A NEW paginated native-SQL endpoint must bind
  parameters (`NamedParameterJdbcTemplate` / `?` placeholders), never concatenate.
```

---

## 9. SOURCE_TRACEABILITY (key files, for direct navigation)

| Layer | File | Key symbol |
|---|---|---|
| Core UI | `UI-BE/lifetrenz-core/src/app/lt-components/lt-pagination/lt-pagination.component.ts` | `LtPaginationComponent` |
| Core UI | `UI-BE/lifetrenz-core/src/app/data/service/lt-paginator.service.ts` | `LtPaginatorService` |
| Core UI | `UI-BE/lifetrenz-core/src/app/data/model/page-dto.ts` | `PageDTO` |
| FDM UI | `.../front-desk-management/src/lib/appointment/all-appointments/all-appointments.component.ts` | `callAppointment()`, `paginate()`, `noOfRecordChange()` (lines ~2537-2734) |
| FDM UI | `.../front-desk-management/src/lib/service/scheduling/schedule-appointment.service.ts` | `getAllappointments()` (line 155) |
| FDM UI | `.../front-desk-management/src/lib/constant/scheduling/schedule-api-constant.ts` | `HIS_ALLAPPOINTMENT_GET = "ipd/opd/all/appointment"` |
| ADT UI (multi-instance example) | `.../adt/src/lib/ip-billing/ip-dnfb/ip-dnfb.component.html` | `[selectedPage]="searchIpDnfbService.pageData"` |
| ADT UI | `.../adt/src/lib/ip-billing/ip-dnfb/search-ip-dnfb.service.ts` | `SearchIpDnfbService.pageData` |
| Inpatient UI (scope anti-pattern example) | `.../inpatient/src/lib/modules/my-pending-q/my-pending-queue/my-pending-queue.component.ts` | `MyPendingQueueComponent.activeItem()` |
| IPD Backend | `ipd-service/.../ipd/opd/appointment/controller/AppointmentController.java` | `getallAppointment()` (line 417) |
| IPD Backend | `ipd-service/.../ipd/opd/appointment/service/impl/AppointmentServiceImpl.java` | `getallAppointment()` (line 571) |
| IPD Backend | `ipd-service/.../ipd/opd/appointment/repository/OPDAppointmentRepository.java` | `getAllAppointments()` (line 113) |
| IPD Backend | `ipd-service/.../ipd/opd/appointment/query/SQL.java` | `getAllAppointments()` (line 128) |
| IPD Backend | `ipd-service/.../ipd/opd/appointment/dto/AppointmentPagedDTO.java` | `{ data, page }` |
| IPD Backend | `ipd-service/.../ipd/billing/dto/PageDTO.java` | `PageDTO` (Java) |
| IPD Backend (JPA pattern example) | `ipd-service/.../ipd/domain/repository/admission/IAdmissionRepository.java` | `findBySiteIdAndActiveTrue(..., Pageable)` |
| Core Backend | `core-service/.../core/patient/controller/PatientController.java` | `getPatients()` (line 427) |
| Core Backend | `core-service/.../core/patient/service/impl/PatientServiceImpl.java` | `getPatients()` (line 684) |
| Core Backend | `core-service/.../core/patient/query/SQL.java` | `getTotalPatientCount` vs `getAllPatientsOptimized` |

---

## 10. AI_IMPLEMENTATION_GUIDE — adding pagination to a NEW page

```
1. UI: add `LtPaginationComponent` to the feature component's `imports` (standalone).
2. UI: add `LtPaginatorService` to that SAME feature component's own `providers` array.
   Do this even if you think you're the only consumer — it's what makes the scope
   correct if the page is ever duplicated/tabbed later.
3. Template:
     <lifetrenz-lt-pagination #paginator
       (pageChange)="onPage($event)"
       (noOfRecordChange)="onPageSize($event)">
     </lifetrenz-lt-pagination>
   If this page will ever show MORE THAN ONE independent paginated list, instead bind
   [selectedPage]="thisList'sOwnPageDTO" per instance (§3a) from the start.
4. onPage()/onPageSize(): mirror the verified shape —
     onPage(event) { this.paginatorService.noOfRecord = event.rows; this.fetch(); }
     onPageSize(v)  { this.paginatorService.noOfRecord = v.value; this.fetch(); }
   fetch() must read the page number fresh via
   `this.paginatorService.paginator?.getPage() ?? 0` — zero-based.
5. On response: `this.paginatorService.selectedPage = result.page;` (or your own
   PageDTO field if using [selectedPage] per §3a) and assign `result.data` to your list.
6. Backend controller: `@RequestParam(defaultValue="15") Integer pageSize,
   @RequestParam(defaultValue="0") Integer pageNo` — keep zero-based, matching the whole
   stack's convention (§2b). Do not introduce a 1-based page number.
7. Backend: build `Pageable paging = PageRequest.of(pageNo, pageSize, Sort.by(sortBy))`
   only if you will actually apply it — see §7 sortBy bug pattern.
8. Backend query: pick Pattern A/B/C per §5D. Whichever you pick, guarantee a
   deterministic ORDER BY and make the count and data queries agree on filtering logic.
9. Backend response: return `{ data: List<T>, page: PageDTO }` (flattened DTO shape,
   §4) — do not return a raw Spring `Page<T>`/`PagedModel` straight to the UI.
10. Bind ALL user-supplied filter/search values as query parameters — never
    string-concatenate into SQL (§8 anti-pattern).
11. Verify zero-based paging end-to-end (§2b) with a manual page-1 vs page-2 request
    before calling it done.
```

## 11. AI_DEBUGGING_GUIDE — pagination bug triage order

```
1. Identify the owning layer first: is the SYMPTOM about what the UI shows (paginator
   text, page-size dropdown) or what the API/DB actually returned? Open the network
   request/response before touching any code.
2. Trace: UI event (pageChange/noOfRecordChange) -> paginatorService fields set ->
   fetch() params -> HTTP request -> controller params -> Pageable construction ->
   repository/SQL -> PageDTO construction -> HTTP response -> paginatorService.selectedPage
   (or [selectedPage] source) -> template binding.
3. Compare actual behavior against the canonical reference flow in §4 at the first point
   they diverge — that is almost always the true root cause location.
4. Cross-check §7 BUG_PATTERNS for the exact symptom before assuming something novel.
5. Fix at the smallest layer necessary — do not refactor pagination architecture to fix
   a single endpoint's bug.
6. If the fix touches native SQL, re-verify: deterministic ORDER BY still present, count
   and data queries still filter identically, all values still bound (not concatenated).
```

