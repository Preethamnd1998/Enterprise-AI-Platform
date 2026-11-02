# Events, Variables and State (verified)

## 1. SearchMenuService (`lifetrenz-core/src/app/layout/service/search-menu.service.ts`, root)

| Member | Kind | Who emits → who listens |
|---|---|---|
| `searchBarToggleEvent$` / `searchBarToggleEmitEvent(el)` | Subject | top-bar arrow → shell (`overlay.toggle`) |
| `searchBarViewEvent$` / `updateSearchBarViewEvent(filter)` | **BehaviorSubject(null)** (replays last) | panel (Search) → host `handleSearch`; shell hides overlay |
| `searchBarViewEventNoReplay$` | `viewEvent$.pipe(skip(1))` | use when you must ignore the replayed value |
| `searchDataEvent$` / `searchDataEventEmit(text)` | Subject | top-bar input (Enter, or empty on input) → host `handleTopBarSearch` |
| `searchStringEvent$` / `searchStringEmit(text)` | Subject | host/panel → chip text |
| `searchClearEvent$` / `searchClearEventEmit()` | Subject | top-bar ✕ → listeners clear |
| `searchTabChangeEvent$` / `searchTabChange(b)` | BehaviorSubject(false) | tab screens |
| `searchBarDataEvent$` / `searchBarDataEmitEvent(d)` | Subject | shell `updateSearchVisibility` |
| `searchString`, `searchPlaceHolder`, `savedChipLable` | fields | top-bar bindings |
| `searchDateString` (default `'Today'`) | field | top-bar date label; set by `checkDateFormValue` (`selectedTime` or `'Custom'`) |
| `convertDateRangeToLabel(range)` | method | maps `[from,to]` → `Today`/`Last 24 hours`/`Last N days ago`/`Next N days`/`Custom` |
| `AppData.isSearchVisible`, `AppData.isDateVisible` | flags | host sets true in `setupSearch`; reset when leaving (screen without filter must set false) |

`SearchFilterEvent` (`src/app/base/model/filter-event`): `{ type: FilterComponentType; filterValue: string (JSON of form); isTop?: boolean }`.

Replay consequence: a host that subscribes to `searchBarViewEvent$` receives the **last** event immediately. The reference guards with
`filter !== null && filter.type === FilterComponentType.<MINE>` (prevents cross-screen leakage) and keeps the replay on purpose (state
survives list re-mount). Keep the guard. Use the NoReplay stream only if a screen must not auto-run on entry.

## 2. Shared form service (`AllAppointmentService`, root) — fields to replicate

| Field | Purpose |
|---|---|
| `appointmentForm: FormGroup` | **single** form read/written by panel and host |
| `rangeDates: Date[]` | `[today,today]` default holder |
| `time: string[]` | chip labels (order matters) |
| `selectedIndex: number` (−1 none) / `selectedTime: string` ("" none, "Custom") | chip selection |
| `componentFilterList: SharedFilterDto[]` | loaded saved filters (shared so list + panel agree) |
| `searchString`, `formValuesArray` | chip text computation |
| methods | `initializeForm()`, `setFilterFormValues(json\|null)`, `checkDateFormValue(isDefault,isTop)`, `updateChipValues()`, `getChipLabel(chip)`, `callAppointment(value)` (top-bar search → today + one field) |

Control set (All Appointments): `rangeDate, appointmentStatus, patientNameMpi, mobile, specializationId, physicianId, payerType,
appointmentType, visitType, appointmentCategoryType, encounterNumber, tokenNumber, emiratesId, filterName, showFilter, waitingList`.
`filterName` and `showFilter` are **UI-only**: exclude them from chips and from the API call (they are saved inside `formValue`; harmless).

Panel local state: `fromDate`, `toDate`, `minDate`, option arrays, `defaultComponentFilter`, `defaultFilterApplied`,
`shouldTriggerDefaultSearch`, `saveFilterLoading`, `@ViewChild('top') overlayPanel`.

## 3. Sequences

**Load — the HOST owns first-load defaults** (the panel only exists while the overlay is open: the shell navigates the aux outlet to
`fdmMainService.searchRoute` on `onOverlayShow` and clears it on `onOverlayHide`, so the panel is created/destroyed on every open/close):
```
host.ngOnInit → setupSearch() (flags, placeholder, searchRoute, subscribe viewEvent$/dataEvent$)
              → filterLoadInFlight = true; callComponentFilter()            (GET type=<KEY>, level=USER, user, site, business)
host.onResult(<FILTER>+'GET'): componentFilterList = result.data; applyFilter(); filterLoadInFlight = false
host.applyFilter():
   default found → isDefaultPresent = true; setFilterFormValues(default.formValue); checkDateFormValue(true,false); searchStringEmit(chips)
   none          → setFilterFormValues(null)  (Today, rest empty); searchStringEmit(chips)
   → callAppointment()   ← THE FIRST FETCH (page 0)
host.handleSearch(): returns immediately while filterLoadInFlight (blocks the BehaviorSubject replay racing the GET)
host.onError(GET): filterLoadInFlight = false (no default, list stays as-is)
```
**Panel (each time the overlay opens)**
```
panel.ngOnInit → form ??= initializeForm(); load master lists; callComponentFilter(GET type,level,user,site,business)
  GET ok → componentFilterList = data||[]
           default found && !defaultFilterApplied → onSelectFilter(default,false); shouldTriggerDefaultSearch=true
  GET error → componentFilterList = []
panel.ngAfterViewInit → if shouldTriggerDefaultSearch → setTimeout 500 → callAppointment()
no default → form stays Today ([today,today]); host performs first fetch itself
```
**Search**
```
panel.callAppointment(): if rangeDate is string → checkDateFormValue(false,false) (label→[from,to])
  → updateSearchBarViewEvent({type, filterValue: JSON(form)})
host.handleSearch(filter): guard type; paginator.first = 0; checkDateFormValue; searchStringEmit(updateChipValues()); fetch
shell: viewEvent$ → searchOP.hide()
```
**Top-bar quick search**
```
topbar Enter → searchDataEventEmit(text) → host.handleTopBarSearch(text):
  form.reset(); selectedIndex = 0; patch { rangeDate:[today,today], <oneField>: text } → applyFilter()
topbar input emptied → searchDataEventEmit('') → same path (clears)
```
**Clear** `clearAppointmentSearch()`
```
default filter exists → setFilterFormValues(default.formValue); checkDateFormValue(true,false); searchStringEmit(chips)
else → setFilterFormValues(null) (today, rest empty, selectedIndex 0); searchStringEmit; handleItemClick(0); fromDate=toDate=null
(Clear does NOT fetch; the user presses Search, or the default path fires via OPD_COMPONENT_FILTER_DEFAULT result)
```
**Apply saved** `onSelectFilter(filter, triggerSearch=true)`
```
parse formValue → if rangeDate label → select chip + expand dates for the calendars
              else custom → selectedIndex=-1; convertToValidDate each; invalid → null
re-hydrate object options by identifierCode (visitType) → patchValue every control explicitly, showFilter:true
→ if string label → checkDateFormValue(true,false) → cdr.detectChanges() → if triggerSearch → callAppointment()
```
**Default toggle** `setDefaultFilter(filter,isDefault)` → PUT `/opd/component/filter/default`; result: if `other.isDefault` → chips + search; else → `clearAppointmentSearch()`.
**Rename** Enter in name input → `updateFilterName` → PUT `/update` → reload list, toast `Filter updated successfully`.
**Delete** DELETE `/opd/component/filter/{id}` → splice by id, toast `Filter deleted successfully`.

## 4. ApiCallBack result keys used (`onResult`)

`<FILTER_CONST>+'GET'` list · `<FILTER_CONST>` save · `…_DEFAULT` default · `…_UPDATE` rename · `…_DELETE+'DELETE'` delete.
Unhandled keys fall to `default`. `onError` for the GET key must reset the list to `[]`.

## 5. Gotchas

- `JSON.stringify(form.value)` turns Dates into ISO strings → always re-convert on load.
- Quick label left unexpanded → backend gets `"Today"` → silent empty result.
- Default-filter apply must wait for the view (`ngAfterViewInit` + timeout) or controls overwrite the patch.
- `filterLoadInFlight` (host guard) blocks searches while saved filters are still loading — replicate if your host loads them itself.
- Unsubscribe `subscriptionHandleSearch` and `subscriptionTopBarSearch` in `ngOnDestroy`; clear `isSearchVisible` for screens that leave the filter.
- The panel is created each time the overlay route activates; keep long-lived state in the **root** service, not the panel.
