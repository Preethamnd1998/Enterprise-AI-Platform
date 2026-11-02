# GLOBAL SEARCH & PAGE FILTER — ARCHITECTURE KNOWLEDGE

Status: Built from direct source inspection (2026-08-26) of Lifetrenz-Core, FDM,
core-service and ipd-service. VERIFIED = read in source. INFERRED/UNVERIFIED = pattern
match only, not directly opened — do not present as certain.

Companion file: `Pagination-Architecture.md` (LtPaginationComponent/LtPaginatorService —
a DIFFERENT subsystem; a searchbar's "Search" action typically ALSO resets pagination,
see the bridge note in §2, but the two subsystems are otherwise independent).

**Resource classification (2026-10-13 reorg audit):** most of this file is KNOWLEDGE (what IS),
including this file's own "HEADLINE FINDING" that `app-searchbar-all-appointment` is NOT a
global patient search, and the three-subsystem breakdown (FDM filter-panel, per-page topbar
quick-search, Core patient-identity search). §7 and §8's `RULE:`/`BUG_PATTERN:` statements are
STANDARD content — `shared/standards/frontend/global-filter-search.md` (which only documented
the FDM filter-panel subsystem) now cross-references this file so the Core patient-identity
search stays discoverable. §11/§12 "AI_IMPLEMENTATION_GUIDE"/"AI_DEBUGGING_GUIDE" are a SKILL
(how-to), left in place rather than extracted — see `shared/reports/` for the full audit.

**HEADLINE FINDING (verify against this before reusing anything below): the task's
premise that `app-searchbar-all-appointment` is a "global patient search" component is
NOT what the source shows.** `SearchbarAllAppointmentComponent` is a **page-specific
advanced filter panel with save/default-filter support** for the All Appointments list.
The actual Core-owned, cross-module, "search by patient identity" capability is a
SEPARATE, different API (`PatientController.getPatients`, core-service). Both are
documented below, clearly separated, because a new page may need either or both.

---

## 1. ENTITIES

```
ENTITY: SearchbarAllAppointmentComponent
TYPE: FDM standalone Angular component — PAGE-SPECIFIC FILTER PANEL, not global search
FILE: .../front-desk-management/src/lib/search/searchbar-all-appointment/searchbar-all-appointment.component.ts
SELECTOR: app-searchbar-all-appointment
OWNS (via shared reactive form on AllAppointmentService, NOT its own state):
  rangeDate (quick time-range OR custom [from,to]), appointmentStatus, patientNameMpi,
  mobile, specializationId, physicianId, payerType, appointmentType, visitType,
  appointmentTime, appointmentCategoryType, encounterNumber, tokenNumber, waitingList,
  filterName, showFilter
PROVIDERS: DatePipe, ConfirmationService, MessageService, LtPaginatorService (component-
  scoped — see Pagination-Architecture.md §3)
KEY BEHAVIORS (all verified):
  - Quick "time splitter" chips (Today / Last 24 hours / Last 7/15/30 days / Next
    7/15/30 days) via AllAppointmentService.time[] and handleItemClick(index)
  - Custom date-range calendars (fromDate/toDate) that patch the same rangeDate control
  - Save current form as a named, optionally-default, per-user filter (saveFilter())
  - Apply a saved filter (onSelectFilter()) or the default one on load
  - Emits filter changes to the host list via SearchMenuService, NOT via a direct
    @Output — see FLOW below
```

```
ENTITY: AllAppointmentService
TYPE: FDM Angular service, providedIn: 'root'
FILE: .../front-desk-management/src/lib/service/all-appointment.service.ts
RESPONSIBILITY: owns the single shared `appointmentForm` (Angular ReactiveForm) that
  BOTH the list page (AllAppointmentsComponent) and its filter panel
  (SearchbarAllAppointmentComponent) read/write — this is how the two components stay
  in sync without a direct parent/child relationship (they are mounted in different
  router outlets, see §2).
VERIFIED time[] (quick filter labels, in display order):
  ["Today", "Last 24 hours", "Last 7 days", "Last 15 days", "Last 30 days",
   "Next 7 days", "Next 15 days", "Next 30 days"]
DEFAULT ON initializeForm(): rangeDate = this.rangeDates = [new Date(), new Date()]
  (i.e. TODAY..TODAY) — this is the literal "default today" behavior.
```

```
ENTITY: ConponentSearchService  (sic — verified spelling in source, do not "fix" it when
  referencing the real symbol)
TYPE: FDM Angular service, providedIn: 'root'
FILE: .../front-desk-management/src/lib/service/conponent-search.service.ts
RESPONSIBILITY: generic "saved filter" CRUD, reused across MANY modules (not FDM-only) —
  three parallel backend-family method sets on the SAME service:
    get/save/update/delete ComponentFilter        -> OPD_COMPONENT_FILTER family (ipd-service /opd/component/filter)
    get/save/update/delete CoreComponentFilter     -> CORE_COMPONENT_FILTER family (core-service)
    get/save/update/delete FdmComponentFilter      -> APPOINTMENT_COMPONENT_FILTER family (appointment-service)
  VERIFIED cross-module reuse (via knowledge-graph ui_callers): the ipd-service
  `/opd/component/filter` family is also referenced from `patient-lib`, `indent`,
  `inventory`, `clinical-casesheet` UI projects, not just FDM.
```

```
ENTITY: SharedFilterDto / SharedFilterFdmDto
FILE: .../patient-lib/src/lib/data/model/shared-filter-dto.ts
FIELDS: id, customerTransactionAttribute, filterName, isDefault:boolean,
  componentType: FilterComponentType, level: FilterLevel, formValue: string
  (JSON-stringified snapshot of the ENTIRE page-specific reactive form — opaque blob to
  the generic filter infrastructure), filterSiteId, filterUserId
```

```
ENTITY: FilterComponentType (enum)
FILE: .../patient-lib/src/lib/data/model/filter-component-type.ts
VERIFIED SIZE: 140+ members — one per saveable-filter page across the ENTIRE product
  (ALLAPP=appointments, IPDNFB, IPOPNBLS, NEWREG, CRDTNOTE, PHRMCYBILLS, SETTLE, ... ).
  This is the key/discriminator that scopes a saved filter to exactly one page's shape.
  RULE: a new saveable-filter page must add its OWN new enum member here — never reuse
  an existing page's FilterComponentType value for a different page's filter shape.
```

```
ENTITY: FilterLevel (enum)
FILE: .../patient-lib/src/lib/data/model/filter-level.ts
VALUES: USER, SITE   — USER = personal saved filter, SITE = shared at the site level.
```

```
ENTITY: SearchMenuService
FILE: UI-BE/lifetrenz-core/src/app/layout/service/search-menu.service.ts (path INFERRED
  from import sites; not opened directly — treat internal member list below as
  UNVERIFIED except where a call site is quoted)
ROLE (VERIFIED via call sites): the bridge between the app-level top-bar search box and
  whichever feature page/filter-panel is currently active.
VERIFIED MEMBERS IN USE: searchBarViewEvent$ (Observable, filter-panel -> list page),
  searchDataEvent$ (Observable, top-bar box -> list page), searchDateString,
  searchPlaceHolder, isSearchVisible, isDateVisible,
  updateSearchBarViewEvent(filter), searchStringEmit(chipString), searchBarDataEmitEvent
```

```
ENTITY: FdmMainService.searchRoute
ROLE (VERIFIED via call site `this.fdmMainService.searchRoute = "searchbar-all-appointment"`
  in AllAppointmentsComponent.setupSearch()): names which "searchbar-*" component the
  app shell should mount into the auxiliary `searchbar` router outlet for the currently
  active page — confirmed by the URL pattern check elsewhere in the same file:
  `this.router.url.includes("(searchbar:searchbar-all-appointment)")`.
```

---

## 2. FLOW — DISTINGUISH GLOBAL SEARCH FROM PAGE-SPECIFIC FILTERING

### 2a. Page-specific filter panel flow (VERIFIED, All Appointments reference)
```
SearchbarAllAppointmentComponent  (mounted in the `(searchbar:...)` auxiliary route,
                                    NOT a child element of the list component)
  --edits--> AllAppointmentService.appointmentForm   (shared FormGroup, providedIn:'root')
  --on submit/callAppointment()--> SearchMenuService.updateSearchBarViewEvent(filter)
       where filter = SearchFilterEvent{ type: FilterComponentType.ALLAPP,
                                          filterValue: JSON.stringify(form.value) }
  --observed by--> AllAppointmentsComponent.searchBarViewEvent$ subscription
       (set up in setupSearch(), FDM list component)
  --> handleSearch(filter): resets paginator to page 0, calls callAppointment()
       (the SAME fetch used by pagination — see Pagination-Architecture.md §4)
```
This is a **cross-router-outlet, event-bus-mediated** connection — the filter panel and
the list are siblings in different outlets, not parent/child, so they cannot use
`@Input`/`@Output` directly; `SearchMenuService` + the shared `AllAppointmentService`
form are the coupling mechanism. A NEW page that wants this exact
filter-panel-in-a-drawer UX must follow the same three-piece shape (dedicated
`searchbar-*` component + a shared root-service form + `SearchMenuService` event) — see
§10 for the concrete recipe.

### 2b. Top-bar quick-search flow (VERIFIED)
```
App header search box --(user types + submits)--> SearchMenuService.searchDataEvent$
  --observed by--> AllAppointmentsComponent.handleTopBarSearch(searchString)
  --> patches ONLY `patientNameMpi: searchString` into the shared appointmentForm
      (rangeDate reset to [today,today] first)
  --> applyFilter() -> re-fetches
```
The header search box is generic (placeholder text is set per-page via
`searchMenuService.searchPlaceHolder = "Search All Appointment"` in `setupSearch()`) —
it does NOT call a separate "global search API"; for the All Appointments page it is
wired to reuse the exact same `patientNameMpi` field the advanced filter panel uses.
**A new page decides for itself what a header keystroke means** by implementing its own
`handleTopBarSearch()`-equivalent subscriber — there is no shared cross-page contract
for what the top-bar box searches.

### 2c. True Core-owned global patient identity search (VERIFIED, separate from 2a/2b)
```
Any consumer (e.g. ScheduleAppointmentService.getPatient(), used when looking up an
  existing patient to book/register — verified call site in
  schedule-appointment.service.ts:221)
  --> GET core-service /core/patient/list/{customerBusinessId}
      (PatientApi.HIS_PATIENT_GET, front-desk-management + other UI projects can all
       call this the same way)
  --> PatientController.getPatients(customerBusinessId, pageSize, pageNo, sortBy,
        nameMpiMobile, genderId, dateOfBirth, email, mobileNumber, externalMpi,
        customerId)
  --> PatientServiceImpl.getPatients() -> PatientRepository
        .getTotalPatientCount() + .getAllPatientsOptimized()   (Pattern C, see
        Pagination-Architecture.md §5)
  --> ApplicationResponse<PatientPageDTO{ data: PatientDTO[], page: PageDTO }>
```
THIS is the reusable, Core-owned, cross-module "find a patient" capability — a single
`nameMpiMobile` field is matched (via Postgres full-text search) across MPI, external
MPI, and patient name simultaneously; `mobileNumber` and `externalMpi` are separate,
dedicated params with their own matching rules (§3 table). **This is what a NEW page
should call if it needs "search for an existing patient by name/MPI/mobile"** — it
should NOT reimplement `searchbar-all-appointment`'s pattern-filter-panel machinery for
that purpose, and it should NOT assume `searchbar-all-appointment` already does this
(it doesn't — it only searches within the appointments already scoped to the current
site/date-range/status filters via its own `patientNameMpi` param on the IPD appointment
endpoint, which is matched with a plain `ILIKE` OR across firstname/lastname/mpi, a
DIFFERENT and separately-implemented matching path from the Core one above — see §3).

---

## 3. GLOBAL_SEARCH_COMMON_FIELDS (only fields verified directly in source)

| Search Field | UI (component/property) | API param | Backend method | DB column(s) | Search Type | Owner |
|---|---|---|---|---|---|---|
| Name / MPI / External MPI (combined) | `getPatient(nameMpiMobile)` (ScheduleAppointmentService) | `nameMpiMobile` | `PatientController.getPatients` → `PatientRepository.getAllPatientsOptimized` | `person.search_vector`, `patient.mpi_search_vector` | PostgreSQL full-text (`plainto_tsquery`), ranked | **Core** |
| Name / MPI / External MPI (combined, COUNT only) | same UI field | `nameMpiMobile` | `PatientRepository.getTotalPatientCount` | `pat.mpi`, `pat.external_mpi`, `p.firstname`, `p.lastname` | `ILIKE '%term%'` (contains) — **different algorithm than the data query, see BUG_PATTERN** | **Core** |
| Mobile number | `getPatient(mobileNumber)` | `mobileNumber` | same repository, both queries | `pc.telecom_number`, `pc.secondary_telecom_number` (cast TEXT) | `LIKE '%term%'` (contains, case-sensitive) | **Core** |
| External MPI (dedicated) | `getPatient(...)` | `externalMpi` | same repository | `pat.external_mpi` | `ILIKE 'term%'` (starts-with) | **Core** |
| Patient Name / MPI (appointment-page filter) | `SearchbarAllAppointmentComponent` → `patientNameMpi` form control | `patientNameMpi` | `AppointmentController.getallAppointment` → `SQL.getAllAppointments` | `PS_F.firstname`, `PS_F.lastname`, `PS_F.mpi` | `ILIKE '%term%'` OR'd across the 3 columns | **Module (IPD/OPD)** — separate implementation from the Core row above, same-shaped field, do not assume they are the same code path |
| Mobile (appointment-page filter) | `SearchbarAllAppointmentComponent` → `mobile` form control | `mobileNumber` | `AppointmentController.getallAppointment` → `SQL.getAllAppointments` | `PS_F.telecom_number` | `ILIKE '%term%'` | **Module (IPD/OPD)** |
| Encounter number | filter panel → `encounterNumber` | `displayEncounterNumber` | same | `ENC_F.display_encounter_number` | `LIKE '%term%'` | Module |
| Token number | filter panel → `tokenNumber` | `tokenNumber` | same | `administrative_event.token_number`, `appointment_token_details.token_number` (EXISTS OR) | `ILIKE '%term%'` | Module |
| Date of birth | filter panel → `dateOfBirth` | `dateOfBirth` | same | `PS_F.date_of_birth::DATE` cast to TEXT | `LIKE '%term%'` (substring on formatted date text) | Module |
| Date range (rangeDate quick filter) | `SearchbarAllAppointmentComponent.time[]` chips | `startDate`,`endDate` | same | `APT.start_date` | `BETWEEN` (range) | Module |

UNVERIFIED (present as fields in `SharedFilterDto`/forms but their DB-level matching
was not opened in this pass — do not present matching type as fact if reused):
appointmentStatus, visitType, payerType, appointmentType, specializationId, physicianId,
appointmentCategoryType, isWaitingList, roleIdentifier — all confirmed to exist as exact
`AND <col> = <value>` or `IN (...)` filters in `SQL.getAllAppointments` (equality, not
fuzzy), but the exact DB column for each was not individually re-verified line-by-line
in this pass beyond what's quoted in `Pagination-Architecture.md` §5 Pattern B.

**Reading the table**: "Owner: Core" rows are genuinely reusable by any module that
needs "find a patient" — they hit `core-service` directly and know nothing about
appointments. "Owner: Module (IPD/OPD)" rows are appointment-list-local filters — even
though `patientNameMpi`/`mobile` LOOK identical to Core's fields, they are separately
implemented against the OPD appointment tables, not the Core patient search endpoint.
**Do not assume filtering the appointment list by name also benefits from Core's
full-text ranking** — it currently does not; it's a plain ILIKE.

---

## 4. TIME SPLITTERS — quick date-range filter (VERIFIED)

```
FLOW:
AllAppointmentService.time = ["Today","Last 24 hours","Last 7 days","Last 15 days",
  "Last 30 days","Next 7 days","Next 15 days","Next 30 days"]

SearchbarAllAppointmentComponent.handleItemClick(index):
  selectedIndex = index; selectedTime = time[index];
  appointmentForm.patchValue({ rangeDate: selectedTime });   // stores the STRING label
  updateFromToDateFromQuickFilter();                          // derives fromDate/toDate
                                                                // for calendar display only

AllAppointmentService.checkDateFormValue(isDefault, isTop):
  if rangeDate is a string containing "Today"/"Last"/"Next":
     rangeDate = [ ArtifactUtils.getDateTimeFromRange(rangeDate).fromDate,
                   ArtifactUtils.getDateTimeFromRange(rangeDate).toDate ]   // expand to
                                                                             // a real
                                                                             // Date pair
     before this form value is sent to callAppointment()/the HTTP request.
```
- The form control holds EITHER a string label ("Today", "Last 7 days", ...) OR a real
  `[Date, Date]` pair (custom range picked via the from/to calendars) — components must
  branch on `typeof rangeDate === 'string'` vs `Array.isArray(rangeDate)` wherever they
  touch this field (verified in 4+ places: `initializeCustomeDate`, `onSelectFilter`,
  `setFilterFormValues`, `checkDateFormValue`).
- `ArtifactUtils.getDateTimeFromRange(label)` is the single conversion point from a
  quick-filter label to an actual `{fromDate, toDate}` pair — reuse this utility for any
  new quick-filter UI rather than re-deriving date math per page.
- **Custom range clears the quick-filter selection and vice versa**: selecting a
  chip sets `selectedIndex >= 0`; picking a custom date sets `selectedIndex = -1,
  selectedTime = ""` (verified in `closeFromDateCalendar`/`closeToDateCalendar`).

---

## 5. SAVE FILTER — mechanism (VERIFIED)

```
FLOW: SearchbarAllAppointmentComponent.saveFilter()
  1. Requires a non-empty `filterName` control value (else warns "Please Enter Filter
     name" and aborts).
  2. Builds SharedFilterDto: componentType = FilterComponentType.ALLAPP,
     level = FilterLevel.USER, formValue = JSON.stringify(appointmentForm.value),
     filterUserId/filterSiteId/customerTransactionAttribute from the logged-in session.
  3. isDefault = false initially (a filter is saved as non-default; becoming the
     default is a SEPARATE action).
  4. ConponentSearchService.saveComponentFilter(this, formVal)
     -> POST ipd-service /opd/component/filter  (OPComponentFilterController.saveComponentFilter)

FLOW: setDefaultFilter(filter, isDefault, flag)
  -> filter.isDefault = isDefault;
     ConponentSearchService.updateComponentFilter(this, filter)
     -> PUT ipd-service /opd/component/filter/default
```
- Saved filters for the current user+page are loaded via
  `callComponentFilter() -> ConponentSearchService.getComponentFilter(this,
  FilterComponentType.ALLAPP, FilterLevel.USER, coreUserId, siteId, customerBusinessId)`
  -> GET `/opd/component/filter`, filtered server-side by type+level+user+site+business.
- On load, the component looks for the ONE filter in the returned list with
  `isDefault === true`; if found, it is applied via `onSelectFilter(defaultFilter,
  false)` and the actual search fires afterward in `ngAfterViewInit` (deferred so
  view-bound controls are stable before values are patched in).

## 6. DEFAULT "TODAY" WHEN NO SAVED FILTER EXISTS (VERIFIED)

```
clearAppointmentSearch():
  if a componentFilterList entry has isDefault === true:
     apply it (setFilterFormValues(that filter's formValue))
  else:
     setFilterFormValues(null)   // <-- the "nothing saved" branch
       -> rangeDates = [new Date(), new Date()]
       -> appointmentForm.patchValue({ rangeDate: rangeDates, ... all other fields:
            filterObj?.field  where filterObj is null, i.e. everything else clears })
       -> selectedIndex = 0; selectedTime = time[0] = "Today"
```
So the concrete rule is: **if the user has no saved default filter for this page, the
page opens with `rangeDate = [today, today]` and every other filter field cleared, and
the UI's quick-filter chip highlighted is "Today" (`time[0]`)** — this is entirely a
frontend default (`AllAppointmentService.rangeDates`/`time[0]`), not something the
backend enforces; the backend simply receives whatever `startDate`/`endDate` the UI
computed for "Today" like any other date range.

---

## 7. GLOBAL_SEARCH_REUSE_PATTERN — what a NEW page should actually reuse

```
RULE: If the new page needs "find/pick an existing patient by name, MPI, or mobile"
  (e.g. registration, booking, attaching a patient to a record) -> call core-service
  `GET /core/patient/list/{customerBusinessId}` (or add a thin wrapper method on your
  module's own service, mirroring `ScheduleAppointmentService.getPatient()`) — do NOT
  build a new name/MPI/mobile query against your own module's tables. This is the one
  genuinely Core-owned, reusable identity-search surface verified in this pass.

RULE: If the new page needs "an advanced filter drawer over MY OWN list, with
  save-filter/default-filter support" -> reuse the THREE-PIECE pattern (§2a), not the
  literal SearchbarAllAppointmentComponent:
    1. Add a new `FilterComponentType` enum member for this page.
    2. Build a page-specific `searchbar-<feature>` standalone component (new component,
       new form shape — the DTO's `formValue` is opaque JSON, so each page's shape can
       differ freely).
    3. Reuse `ConponentSearchService` as-is (pick the OPD/CORE/APPOINTMENT family that
       matches which backend service owns your list) and `SharedFilterDto`/
       `FilterComponentType`/`FilterLevel` as-is — do not create new save-filter DTOs.
    4. Reuse `SearchMenuService` (or confirm the app-shell equivalent in use if this has
       since been renamed) as the event bridge between the filter panel and the list, if
       they are mounted in separate router outlets like the reference flow; a simpler
       page can just make the filter panel a literal child component with
       @Input/@Output instead — the event-bus approach is only required BECAUSE the
       reference implementation mounts the filter panel in an auxiliary route.
    5. Default-to-today: initialize your form's date field the same way
       (`[new Date(), new Date()]`) and replicate the `isDefault` saved-filter lookup on
       init if you want the same "today unless a default is saved" UX.

RULE: Do not duplicate Core functionality in FDM/IPD if a reusable Core API/service
  already exists (`getPatients`/`nameMpiMobile` for identity search) — verified above
  that FDM currently does NOT reuse it for the appointments list's own patientNameMpi
  filter (it reimplements a simpler ILIKE match instead); that is an existing
  divergence, not a pattern to copy into a NEW page. Prefer the Core endpoint going
  forward for any new "find a patient" need.
```

---

## 8. GLOBAL_SEARCH_BUG_PATTERNS

```
BUG_PATTERN: Search returns no results
LIKELY ROOT CAUSES:
  - Wrong endpoint called for the intent — e.g. calling the appointment-list
    patientNameMpi filter (Module-owned, ILIKE against 3 columns, scoped to the
    site/date-range/status already selected) when the actual intent was "find this
    patient anywhere" (needs the Core `nameMpiMobile` full-text endpoint instead).
  - rangeDate left as an unexpanded quick-filter STRING instead of being converted via
    checkDateFormValue()/getDateTimeFromRange() before the request — the backend then
    receives a literal string like "Today" in `startDate`/`endDate` instead of ISO
    dates, and the SQL `BETWEEN` comparison silently matches nothing.
FILES TO INSPECT: the form-value snapshot actually sent (log `appointmentForm.value`
  right before the HTTP call); compare against §4's expected `[Date, Date]` shape.
```
```
BUG_PATTERN: Search works on one page but not another (for what looks like "the same"
  field, e.g. two pages both have a "Mobile" filter)
ROOT CAUSE: two pages' "Mobile" fields are NOT necessarily the same code path — see §3,
  Core's `mobileNumber` (case-sensitive `LIKE`) vs. the appointment filter's `mobile`
  (case-insensitive `ILIKE`) are different implementations against different tables.
  Do not assume shared UI field naming implies shared backend behavior.
```
```
BUG_PATTERN: Search field exists in UI but has no effect on results
ROOT CAUSE CLASS: the form control exists (bound in the template, present in
  `SharedFilterDto.formValue` when saved) but the backend query builder never reads
  that param, OR reads it but the SQL fragment is guarded by a condition that's never
  true for real input (e.g. an `isBlank()` check inverted). VERIFICATION: grep the
  backend `SQL.java` builder for the exact param name; confirm it appears inside a
  WHERE fragment, not just the method signature.
```
```
BUG_PATTERN: Wrong/incomplete Core-vs-Module field mismatch when carrying a "search
  string" across pages (e.g. top-bar search box value used as-is against a different
  page's field)
ROOT CAUSE: the top-bar search box (§2b) has no single global contract for what field it
  populates — each page's `handleTopBarSearch()`-equivalent decides. A new page must
  explicitly implement this subscriber; simply relying on "the header box already
  searches patients" is false — confirm per-page.
```
```
BUG_PATTERN: Saved filter applies but list stays stale / wrong page shown
ROOT CAUSE: `onSelectFilter()` patches the form but the caller forgot to also reset
  pagination to page 0 before re-fetching (see Pagination-Architecture.md §7 "Filters
  reset pagination incorrectly"). The reference flow's `handleSearch()` explicitly does
  `paginatorService.paginator.first = 0` — a new save-filter consumer must do the same.
```
```
BUG_PATTERN: "Today" default not showing on fresh page load
LIKELY ROOT CAUSE: `componentFilterList` fetch (`callComponentFilter()`) resolves AFTER
  the initial render and a stale/undefined default check fires too early, OR a NEW
  page's init sequence never calls the equivalent of `clearAppointmentSearch()`'s
  "no default -> setFilterFormValues(null)" fallback at all, leaving the form's raw
  FormBuilder initial value (whatever was hardcoded in that page's `initializeForm()`)
  displayed instead of an explicit today range.
VERIFICATION: confirm the page's `initializeForm()` sets `rangeDate` to a fresh
  `[new Date(), new Date()]` at construction time AND that the default-filter lookup
  (if no saved default exists) does not leave the form in a different, unintended state.
```

---

## 9. ARCHITECTURAL_RULES (search/filter-specific, consolidated)

```
RULE: Do not invent global-search fields. Only the fields verified in §3 are confirmed
  to exist and behave as documented; anything else must be re-verified in source before
  being presented as a fact, and marked UNVERIFIED until then.
RULE: Do not assume "global search" and "page filtering" are the same subsystem just
  because a component is named "searchbar-*" — verify which of §2a/§2b/§2c it actually
  is before reusing it.
RULE: A new saveable-filter page adds its own FilterComponentType enum member; never
  reuses ALLAPP or another page's value.
RULE: When a save-filter panel is added, its "no default saved" fallback must produce a
  well-defined, intentional default (this codebase's convention: today's date, all
  other filters cleared) — never leave it as "whatever the FormBuilder happened to
  initialize."
RULE: Trace the existing implementation (§2a/§2b/§2c) before building a new search/filter
  feature — confirm via source (or the knowledge-graph MCP, see project CLAUDE.md) which
  of the three shapes above actually fits the new requirement.
RULE: When fixing a global-search bug, trace: search input -> which component owns the
  form control -> which service call (module list filter vs. Core identity search) ->
  API params -> controller -> service -> repository/SQL matching logic (ILIKE vs
  full-text vs exact) -> DB columns. Confirm at which hop actual behavior first diverges
  from the table in §3.
```

---

## 10. SOURCE_TRACEABILITY

| Layer | File | Key symbol |
|---|---|---|
| FDM UI (filter panel) | `.../front-desk-management/src/lib/search/searchbar-all-appointment/searchbar-all-appointment.component.ts` | `SearchbarAllAppointmentComponent` |
| FDM UI (shared form/state) | `.../front-desk-management/src/lib/service/all-appointment.service.ts` | `AllAppointmentService.time[]`, `initializeForm()`, `setFilterFormValues()`, `checkDateFormValue()` |
| FDM UI (list host) | `.../front-desk-management/src/lib/appointment/all-appointments/all-appointments.component.ts` | `setupSearch()`, `handleSearch()`, `handleTopBarSearch()` |
| FDM UI (generic saved-filter client) | `.../front-desk-management/src/lib/service/conponent-search.service.ts` | `ConponentSearchService` |
| Patient-lib model | `.../patient-lib/src/lib/data/model/shared-filter-dto.ts` | `SharedFilterDto`, `SharedFilterFdmDto` |
| Patient-lib model | `.../patient-lib/src/lib/data/model/filter-component-type.ts` | `FilterComponentType` (140+ members) |
| Patient-lib model | `.../patient-lib/src/lib/data/model/filter-level.ts` | `FilterLevel { USER, SITE }` |
| FDM UI (Core identity search caller) | `.../front-desk-management/src/lib/service/scheduling/schedule-appointment.service.ts` | `getPatient()` (line 221) |
| Patient-lib API constant | `.../patient-lib/src/lib/patient-lib/data/constant/patient-api.ts` | `HIS_PATIENT_GET = "/core/patient/list"` |
| IPD Backend (saved filter) | `ipd-service/.../ipd/opd/search/controller/OPComponentFilterController.java` | `getComponentFilter/saveComponentFilter/updateDefaultFilter/deleteFilter` |
| IPD Backend (appointment list filter matching) | `ipd-service/.../ipd/opd/appointment/query/SQL.java` | `patientNameMpi`, `mobileNumber`, `tokenNumber` ILIKE clauses (lines ~162-210) |
| Core Backend (identity search) | `core-service/.../core/patient/controller/PatientController.java` | `getPatients()` (line 427), `getPatientsBy()` (line 445) |
| Core Backend (identity search impl) | `core-service/.../core/patient/service/impl/PatientServiceImpl.java` | `getPatients()` (line 684) |
| Core Backend (matching logic) | `core-service/.../core/patient/query/SQL.java` | `getTotalPatientCount` (ILIKE, ~line 58) vs `getAllPatientsOptimized`/`buildFullTextSearchCondition` (full-text, ~line 232, 318) |

---

## 11. AI_IMPLEMENTATION_GUIDE — adding search/filter to a NEW page

```
1. Decide FIRST which of the three shapes (§2a/§2b/§2c) the requirement actually is:
   - "find an existing patient across the system" -> §2c, call core-service directly.
   - "filter MY OWN list, with save/default support" -> §2a, three-piece pattern.
   - "a header quick-search box for my page" -> §2b, implement your own subscriber;
     decide explicitly which field(s) it populates.
2. For §2a: add a FilterComponentType member; build searchbar-<feature> component; reuse
   ConponentSearchService + SharedFilterDto; wire via SearchMenuService or direct
   @Input/@Output if the panel is a literal child (simpler, prefer this unless you
   specifically need the auxiliary-route mounting the reference flow uses).
3. Default state: initialize the date field to [new Date(), new Date()] (today) and all
   other filters empty; on init, look up saved filters for
   (FilterComponentType.<yours>, FilterLevel.USER, currentUser/site/business) and apply
   the one with isDefault === true if present, else leave the today-default as-is.
4. Quick time-range chips: reuse `ArtifactUtils.getDateTimeFromRange(label)` against the
   same label set (or a page-appropriate subset) rather than re-deriving date math.
5. Wherever the filter changes fire a re-fetch, also reset pagination to page 0 first
   (see Pagination-Architecture.md §7).
6. Backend: bind every filter param (prepared statement / JPA param), never
   string-concatenate (security requirement, also flagged in Pagination-Architecture.md
   §8) — this applies equally to filter/search SQL as to the base list query.
7. If exposing a combined "name/MPI/mobile" search on your OWN table (not calling Core),
   document explicitly in your endpoint whether it's ILIKE-contains, prefix-match, or
   full-text — and make sure any COUNT query for it uses the identical matching logic
   (see BUG_PATTERN in §8).
```

## 12. AI_DEBUGGING_GUIDE — search/filter bug triage order

```
1. First classify the report against §2a/§2b/§2c — a "search isn't finding my patient"
   report against an appointment-list filter box is often actually a request for the
   Core identity search (§2c), not a bug in the filter box at all.
2. Trace: search input -> owning form control -> which service method -> API params ->
   controller -> service -> repository/SQL matching clause -> DB columns (§3 table).
3. If the symptom is "works elsewhere, not here", diff the two pages' backend matching
   clauses directly (ILIKE vs full-text vs exact) rather than assuming shared code.
4. If the symptom involves a saved/default filter, check FilterComponentType +
   FilterLevel + userId/siteId/customerBusinessId actually match between the save call
   and the load call — a mismatch on any of these silently returns an empty list from
   getComponentFilter, which looks identical to "no filters saved yet."
5. If the symptom is about a quick time-range chip, verify the form control's value at
   the moment of the HTTP call: is it still the STRING label (bug) or has it been
   expanded to a real Date range via checkDateFormValue()?
6. Fix at the smallest layer; do not redesign the three-piece save-filter architecture
   to fix one page's bug.
```
