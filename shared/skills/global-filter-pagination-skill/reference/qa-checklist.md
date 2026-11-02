# QA Checklist — Filter + Pagination (Gate A completeness / Gate B regression)

## Backend
- [ ] Schema verified against live DB (tool + env named) or flagged unverified
- [ ] `SQL` class returns one literal string; three-stage CTE; count-as-column; deterministic ORDER BY with id tiebreaker
- [ ] No raw String concatenated: dates parsed/re-formatted, codes whitelisted, free text via `SqlSafe`, lists validated
- [ ] Count and data share the same WHERE (single builder)
- [ ] Controller: `pageNo` default 0, `pageSize` default 15 and clamped 1..100, blank→null normalisation
- [ ] Response `{data, page:PageDTO}`; `currentPageSize = rows on page`; `totalPages = ceil(total/pageSize)`
- [ ] RowMapper total holder is method-local
- [ ] `FilterComponentType` member added in BE enum (+ Flyway/DB check constraint if the column is constrained)
- [ ] Mongo: count before skip/limit, shared Criteria, sort tiebreaker, `Pattern.quote` on regex
- [ ] `EXPLAIN ANALYZE` on realistic data for large tables; indexes noted
- [ ] Existing endpoints/contracts untouched (Gate B)

## UI filter (global-filter-skill checklist applies in full)
- [ ] Panel visuals identical to reference; Today default; default-filter wins; Clear restores
- [ ] Search → paginator reset → exactly one fetch
- [ ] Saved filter create/rename/default/delete OK; one default per user+page

## UI pagination (pagination-skill checklist applies in full)
- [ ] `LtPaginatorService` in component `providers`; `<lifetrenz-lt-pagination>` in table footer
- [ ] page click → `pageNo = event.page`; size change → page 0
- [ ] Multi-paginator pages: independent state per list

## Integration proofs
- [ ] Page 0 vs page 1 requests: disjoint rows, same `total`
- [ ] On page 3 change filter → page 1 shown, one request in network tab
- [ ] On page 3 change page size → page 1
- [ ] Filter yielding 0 rows → empty message, "0 records"
- [ ] Reload with a saved default → default applied, search fired once after view stable
- [ ] Only the new/changed specs run (scoped testing)
