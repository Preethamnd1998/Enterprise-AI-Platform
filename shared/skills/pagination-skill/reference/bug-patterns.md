# Pagination Bug Patterns (symptom → cause → fix)

| Symptom | Likely cause | Fix |
|---|---|---|
| Click page 2, same rows as page 1 | `fetch()` uses a cached page number / `(pageChange)` not wired to the fetch | read `paginator.getPage()` (or `event.page`) at call time; wire `(pageChange)` |
| Pages off by one (page 2 shows page 3) | UI sent `event.page + 1` | send raw 0-based `event.page` (stack is 0-based: PrimeNG, `@RequestParam pageNo defaultValue 0`, `PageRequest.of`) |
| Size change leaves user on page 5 of 100/page | custom paginator skipped reset | use `<lifetrenz-lt-pagination>` (it resets) or call `changePageToFirst`/send `pageNo=0` |
| Two requests per filter change | host used `changePageToFirst()` (emits `onPageChange`) then fetched | set `paginator.first = 0` (no emit), fetch once |
| Two requests per size change | stale-rows re-emit | already guarded inside `LtPaginationComponent` — don't re-implement the reset in the host |
| Page B opens on page A's page/size | `LtPaginatorService` not in the host `providers` (root singleton) | add it to `providers` |
| Totals show another list's count | multiple paginators sharing `paginatorService.selectedPage` | per-list `PageDTO` via `[selectedPage]`; `reference/multi-instance.md` |
| `paginator.getPage()` reads the wrong list | last-created paginator overwrote `paginatorService.paginator` | per-list state; page number from the event, reference via `#pagerX` |
| Footer says `0 records` with rows present | RowMapper never set `total` / count query ≠ data query / out-of-range page | CTE count-as-column; one WHERE builder; fallback to page 0 (parent `be-sql-format.md`, `XxxService` template) |
| Rows repeat/skip between pages | unordered `LIMIT/OFFSET` | deterministic `ORDER BY …, id DESC` |
| Last page missing a row | `totalPages` computed with integer division | `Math.ceil((double) total / size)` or Spring `Page.getTotalPages()` |
| Spinner never stops | `loading=false` only in `onResult` | also in `onError` |
| `result.pageDTO` undefined | followed the standards text | payload field is `page` |
| Page stays on 6 after filter reduces to 1 page | no reset on filter change | `paginator.first = 0` before the fetch |
| Dropdown shows 15 after tab switch | paginator re-created with default | keep `pageSize` in the host/state and pass `[rows]`… the component has no `rows` input: reset state to 15 on tab activation instead |
| Client-side slicing of a large array | anti-pattern | server-side paging |
| `sortBy` param has no effect | native SQL hard-codes ORDER BY | whitelist sort columns in the SQL class or drop the param |

Triage order: Network tab (request params + response `page`) → host handler → `LtPaginatorService` scope → controller params → `Pageable`/SQL → `PageDTO` construction → binding `[selectedPage]`.
