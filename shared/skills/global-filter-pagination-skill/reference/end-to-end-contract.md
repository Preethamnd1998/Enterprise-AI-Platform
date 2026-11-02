# End-to-End Contract (UI ⇄ API ⇄ DB)

Reference: `GET ipd-service /opd/all/appointment` (`AppointmentController.getallAppointment`).

## 1. Request

| Param | Type | Default | Rule |
|---|---|---|---|
| `pageNo` | int | `0` | **0-based**, raw PrimeNG page index. Never `+1`. |
| `pageSize` | int | UI: `15` (BE fallback differs per endpoint: 10 / 100) | UI always sends it. New endpoints: default `15`, **cap at 100** (matches UI max option). |
| `sortBy` | String | `id` | Reference accepts it but its native SQL ignores it. New endpoints: either whitelist sort columns in the `SQL` builder or **omit the param**. |
| `startDate`, `endDate` | String | required when screen has a date filter | UTC date-time strings from `UtcService.getUtcDateTimeRange([from,to])`. Parse on BE (see be-sql-format §3). **UNVERIFIED exact format** — confirm at the call site before writing the parser. |
| filter fields | String/Long/Boolean | `""` / `null` | UI sends `""` for empty; controller normalises blank → `null`. Numeric ids parsed with a safe parser (`parseLongSafe`). Multi-value (status codes) as comma list or `String[]`. |

Date semantics: the UI form holds **either** a quick-filter label (`"Today"`, `"Last 7 days"`…) **or** a
`[Date, Date]` pair. Labels must be expanded with `ArtifactUtils.getDateTimeFromRange(label)` before the
HTTP call. Sending a label to the backend silently matches nothing.

## 2. Response

```json
{
  "data": [ { "...row dto...": 1 } ],
  "page": { "totalPages": 8, "currentPageNo": 0, "currentPageSize": 15, "total": 117 }
}
```

- Java: `class <Feature>PagedDTO { List<RowDTO> data; PageDTO page; }`; `PageDTO { int totalPages; int currentPageNo; int currentPageSize; Long total; }`.
- `currentPageSize` = **rows on this page** (`getNumberOfElements()`), not the requested size.
- `totalPages` from Spring `Page.getTotalPages()` (= `ceil(total/pageSize)`); if you compute it yourself use
  `(int) Math.ceil((double) total / pageSize)` — never integer division.
- Service builds `new PageDTO(page.getTotalPages(), page.getNumber(), page.getNumberOfElements(), page.getTotalElements())`.
- Controller returns the DTO directly (`ResponseEntity<XPagedDTO>`) as the reference does; wrap in
  `ApplicationResponse<>` only if the service family already does (then UI reads `result.data.data`/`result.data.page` —
  check the sibling endpoints of the service you are in; stay consistent with them).
- Never return raw Spring `Page<T>` / `PagedModel`.

UI mirror: `src/app/data/model/page-dto.ts` → `{ totalPages, currentPageNo, currentPageSize, total }`.

## 3. UI consumption

```ts
this.rows = result?.data;
this.paginatorService.selectedPage = result?.page;   // or the list's own PageDTO field (multi-instance)
this.loading = false;                                // also in onError
```
`<lifetrenz-lt-pagination>` shows `"{total} records,  {totalPages} pages in total"` from `selectedPage.total` and
computes pages itself from `rows`. Current page comes from PrimeNG, not from `currentPageNo`.

## 4. State transitions

| Event | Page sent | Page size | Notes |
|---|---|---|---|
| First load | 0 | 15 | + default filter applied first (global-filter-skill) |
| Page click | `event.page` | `event.rows` | |
| Page-size change | 0 | new value | component resets itself; host just refetches |
| Filter Search / Clear / apply saved / set default | 0 | unchanged | host sets `paginator.first = 0` then one fetch |
| Top-bar quick search | 0 | unchanged | |
| Delete last row on a page | stay; if page becomes empty go to previous | | host decides |

## 5. Empty / error / out-of-range

- Empty set: `data: []`, `page.total: 0`, `totalPages: 0`; table shows its `emptymessage` template.
- Out-of-range page (e.g. page 5 after data shrank): the count-as-column CTE returns **no rows ⇒ `total = 0`**
  (limitation of the reference pattern). The UI avoids it by always resetting to page 0 on filter change. If a list
  can shrink under the user (deletes, live data), add the fallback in `templates/be/XxxService.java.tpl`
  (`if rows empty && pageNo > 0 → re-run page 0`).
- Errors: host `onError` sets `loading=false` and toasts; the paginator keeps its last state.

## 6. Time-range default (UX rule)

1. Screen has a date range: default **Today** (`[today,today]`, chip "Today" highlighted, top-bar label "Today").
2. User has a saved filter flagged `isDefault`: apply it instead and fire the search once the view is stable.
3. Screen has **no** date range: no date params; backend returns recent-first page 0.
4. "Clear" restores (2) if a default exists else (1).
5. Custom dates: From/To calendars; choosing either clears the chip selection (`selectedIndex=-1`);
   `To < From` is rejected with a toast `"To Date cannot be before From Date"`.
