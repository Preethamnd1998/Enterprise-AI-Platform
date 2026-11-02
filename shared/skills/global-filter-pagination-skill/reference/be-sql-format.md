# Backend (PostgreSQL) — SQL Format for Paginated, Filtered Lists

Authority: `shared/standards/backend/sql-query.md` (read it; this file is the applied recipe).
Verified reference: `ipd-service` `opd/appointment/query/SQL.java::getAllAppointments`,
`OPDAppointmentRepository.getAllAppointments`, `AppointmentServiceImpl.getallAppointment`.

## 1. Layering (same as reference)

```
Controller  → normalise params (blank→null, safe parse) → Service
Service     → PageRequest.of(pageNo, pageSize) → Repository → build <Feature>PagedDTO{data, PageDTO}
Repository  → String sql = <Feature>SQL.getXxx(...);  jdbcTemplate.query(sql, rowMapper)  → PageImpl(rows, pageable, total)
SQL class   → ONE method returns ONE complete literal string (debug breakpoint on `return`, copy-paste to psql)
```

Why a literal string: debuggability. Keep it. Do **not** mix `NamedParameterJdbcTemplate` bindings into the
same query (sql-query.md).

## 2. The query shape (Pattern B: three-stage CTE, count-as-column)

```sql
WITH BASE_FILTERED AS (            -- 1. all filters, lightweight joins only; (id, sort key)
  SELECT T.ID, T.CREATED_DATE
  FROM   <table> T
  LEFT JOIN <only joins needed for filters> ...
  WHERE  T.SITE_ID = <Long> [AND <optional fragments>]
),
TOTAL_COUNT AS ( SELECT COUNT(*) AS total FROM BASE_FILTERED ),   -- 2. one count, same WHERE
BASE AS (                          -- 3. paginate narrow ids
  SELECT ID FROM BASE_FILTERED
  ORDER BY CREATED_DATE DESC, ID DESC          -- deterministic: unique tiebreaker
  LIMIT <pageSize> OFFSET <offset>
)
SELECT TC.total, <explicit columns, no SELECT *>
FROM   BASE B CROSS JOIN TOTAL_COUNT TC
JOIN   <table> T ON T.ID = B.ID
LEFT JOIN LATERAL ( ... enrichment only for the page's rows ... ) X ON TRUE
ORDER BY T.CREATED_DATE DESC, T.ID DESC;       -- re-assert order on the outer select
```

Rules:
- Filter + paginate **narrow first**, enrich **only the page's rows** (the reference fixed a 27 s window-function
  query this way). Never enrich the full filtered set.
- `LIMIT/OFFSET` from `Pageable.getPageSize()/getOffset()` (long/int from the Pageable — safe to concatenate).
  Append only when `isPagination` is true if the caller needs an unpaged export variant.
- RowMapper reads `rs.getLong("total")` into a **method-local** `long[] totalCount = {0L}` (never a singleton field)
  and the repo returns `new PageImpl<>(rows, pageable, totalCount[0])`.
- Always specify the full ORDER BY; an unordered LIMIT/OFFSET duplicates/skips rows on live tables.
- Select only needed columns; add indexes for filtered/sorted columns after `EXPLAIN ANALYZE` on a realistic dataset.
- Pattern C (separate count query) only if count and data genuinely need different techniques — then **one shared
  WHERE builder** (private static method) feeds both; never two hand-written copies.
- If sorting is user-selectable: whitelist `sortBy → column` in the SQL class; unknown → default. Never concatenate
  a client column name.

## 3. Safe values (what may be concatenated)

| Value type | Rule |
|---|---|
| `Long`, `Integer`, `Boolean`, enum constant | concatenate directly (sql-query.md) |
| Date / date-time (arrives as `String`) | **parse at the controller/service boundary** (`LocalDate.parse` / `LocalDateTime.parse`, throws on junk) and concatenate the **re-formatted** value (`DateTimeFormatter`). Never the raw request string. The reference's `startDate.replace("'", "")` is not enough — do not copy. |
| Code/identifier strings (status code, visit type code, type enum name) | validate against a whitelist/enum first (`FilterComponentType.valueOf`), or match `^[A-Za-z0-9_\-]{1,64}$`; reject otherwise |
| Free-text search (name/MPI, token, encounter no.) | `SqlSafe.likeContains(raw)` from `templates/be/SqlSafe.java.tpl`: length cap, doubled quotes, escaped `% _ \`, rendered inside `ILIKE '%…%' ESCAPE '\'`. **Gap flag:** sql-query.md only says "validate/parse raw Strings"; it has no rule for free text. `SqlSafe` is this skill's proposal — get team sign-off before first use and record the decision in the standards file. |
| Lists (`IN (...)`) | split, validate each element as a code (above) or Long, re-join |

Search matching: state it in the endpoint javadoc (contains/prefix/exact). Count and data share the same WHERE, so
they cannot disagree (the core-service patient search had this bug: ILIKE count vs full-text data).

## 4. Page-number plumbing

```java
// controller
@RequestParam(defaultValue = "0")  Integer pageNo,
@RequestParam(defaultValue = "15") Integer pageSize      // clamp: Math.min(Math.max(pageSize,1),100)
// service
Pageable paging = PageRequest.of(pageNo, pageSize);       // add Sort only if the SQL class honours it
```

## 5. Debug / verification

- Log the `sql` at DEBUG (truncated) and `paging.getPageSize()/getOffset()` at INFO, like the reference.
- `EXPLAIN ANALYZE` on large tables before merge (encounter/appointment/order-history class tables).
- Verify schema (names, types, indexes) against the live DB with the environment's `mcp__*-db__query` first.
- Manual check: request page 0 and page 1; row sets must not overlap; `total` identical on both.

## 6. Saved-filter table queries

`opd/search/query/FilterSQL.getComponentFilter` concatenates `type` (raw String) and omits `level`/`site_id`
from the WHERE although the endpoint receives them. For new filter endpoints: convert `type`/`level` to enums
first, concatenate `.name()`, and decide deliberately whether site scoping is wanted (see
`global-filter-skill/reference/saved-filter-backend.md`).
