# Backend (MongoDB) — Same Contract, Mongo Mechanics

The UI contract does not change: same `pageNo`/`pageSize` params, same `{ data, page: PageDTO }` response,
same 0-based paging, same reset rules. Only the query changes.

**Status:** the SQL reference is verified end to end; the Mongo reference below is verified only for the
primitives found in `ipd-clinical-service` (`CaseSheetServiceImpl` ~L3387 `query.skip((long) pageNo * pageSize).limit(pageSize)`;
`MewsServiceImpl` ~L863 `Aggregation.skip/limit`). The `PageDTO` mapping and templates here are the skill's
recommendation — **UNVERIFIED against a shipped Mongo list endpoint.**

## 1. Which DTO

`ipd-clinical-service` also has its own `PageRequest`/`PageResponse` (`content/page/size/totalElements/…`).
That shape is **not** what the shared UI paginator reads. Services that feed `<lifetrenz-lt-pagination>` must return
`{ data, page: PageDTO{totalPages,currentPageNo,currentPageSize,total} }`. Either map `PageResponse → PageDTO`
at the controller/service boundary or add `PageDTO` to the service (template provided). Raise with the team before
standardising which of the two lives in `ipd-clinical-service`.

## 2. Query rules (mirror the SQL rules)

- **Count before skip/limit.** `MongoTemplate.count(query, …)` honours the query's `skip`/`limit`; counting a
  paged query returns the page size, not the total. Build the filter `Criteria` once, `count(new Query(criteria))`,
  then apply `skip/limit` to a second `Query`. (The example javadoc in `PageRequest.java` counts after paging —
  don't copy it.)
- One `Criteria` builder method used for both count and find — same WHERE guarantee.
- Deterministic sort with tiebreaker: `Sort.by(DESC, "createdDate").and(Sort.by(DESC, "_id"))`.
- Project only needed fields (`fields().include(...)`) for list screens.
- Date filters: parse to `Instant/LocalDateTime/Date` and use `Criteria.where("createdDate").gte(from).lte(to)`;
  never build the query from raw strings.
- Free text: `Criteria.where("name").regex(Pattern.quote(term), "i")` — always `Pattern.quote` user input;
  cap length. Prefer prefix regex (`^`) or a text index for large collections.
- Large collections: index the filtered + sorted fields (compound, matching sort order); use `explain` before merge.
  Deep `skip` is O(n); for very deep paging consider range queries — out of scope for standard screens.
- Aggregation variant (joins/lookups): `match → facet{ data:[sort, skip, limit], total:[count] }` gives rows and total
  in one round trip, the Mongo analogue of the SQL count-as-column CTE. Use `$match` first so indexes apply.
- Postgres + Mongo in one screen: run each store's paged query independently; never merge pages across stores.

## 3. Shape

```java
long total = mongoTemplate.count(new Query(criteria), Doc.class);
Query q = new Query(criteria).with(sort).skip((long) pageNo * pageSize).limit(pageSize);
List<Doc> rows = mongoTemplate.find(q, Doc.class);
int totalPages = (int) Math.ceil((double) total / pageSize);
return new FeaturePagedDTO(mapper.toDtos(rows), new PageDTO(totalPages, pageNo, rows.size(), total));
```
Template: `templates/be/XxxMongoRepository.java.tpl`.

## 4. Saved filters in Mongo-backed services

The saved-filter table (`component_filter`) lives in Postgres families (ipd-service OPD, core-service CORE,
appointment-service APPOINTMENT). A Mongo-only service reuses the one that matches the owning UI library
via `ConponentSearchService`; do not create a new filter store per service.
