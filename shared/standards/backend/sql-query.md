# BE — SQL Query-Writing Rules

> Split out of `repository.md` — that file covers repository class/interface
> structure; this file covers how the SQL/JPQL itself must be written.
> Also read: `coding-standards/STANDARDS.md`, `rules/security.md` (SQL/query
> injection section), [`repository.md`](repository.md).

---

## Verify schema before writing SQL

Before writing or modifying any query, confirm the target table/column names,
types, nullability, indexes, and constraints against the **live** database via
the appropriate `mcp__*-db` query tool for the target environment (see
`shared/knowledge/architecture/environments.md` for which server maps to which
environment) — not from memory, not from a JPA entity that may be stale, and
not by guessing from naming conventions. If MCP access to the target
environment is unavailable, say so explicitly and either request schema
details from the user or work from a named, explicitly-flagged-as-unverified
reference (a Flyway migration file, the entity class) — never present
unverified schema as confirmed.

## Baseline rules — every query, every service

- Every new database query must be reviewed for performance.
- Avoid `SELECT *`; select only required columns.
- Use pagination for large result sets.
- Avoid N+1 queries.
- Add indexes for frequently filtered, joined, or sorted columns where justified.
- Foreign keys must be validated and indexed where appropriate.
- Do not perform unnecessary queries inside loops.
- Use batch operations for bulk inserts/updates.
- Use transactions for logically atomic operations.
- Do not perform writes inside read-only transactions.
- Database migrations must be versioned and immutable once applied.
- Never modify an already-applied migration; create a new migration.
- SQL must use parameters/prepared statements; never concatenate user input.
- Large-data operations must define an explicit batch size.
- Queries processing large tables must be reviewed with an execution plan where
  appropriate.

These apply uniformly — including to the string-built native-query style
documented below, which needs its own extra care to actually satisfy the
parameter-binding rule (see "Known gap," below).

---

## String-built native queries — the `*.query.SQL` pattern

**Verified real example:**
`com.lifetrenz.lths.ipd.mrd.query.SQL.getAllPatientEncounterDiagnosis` (`ipd-service`).
This file/pattern represents two things at once: **string concatenation to build
a native SQL query as plain text**, and **manual `Pageable` handling** (rather
than delegating pagination to Spring Data or `NamedParameterJdbcTemplate`'s bound
`LIMIT`/`OFFSET`).

```java
public static String getAllPatientEncounterDiagnosis(Pageable page, String startDate, String endDate,
        Long siteId, Long customerBusinessId, Long patientId, Boolean isPagination) {
    String query = "SELECT ... FROM PATIENT_ENCOUNTER_DIAGNOSIS PED\r\n"
            + "LEFT JOIN ADMISSION ADM ON PED.ADMISSION_ID = ADM.ID\r\n"
            + "...\r\n"
            + "WHERE \n" + "PED.ACTIVE = TRUE\r\n"
            + "AND PED.SITE_ID = " + siteId + "\r\n"
            + "AND PED.CUSTOMER_BUSINESS_ID = " + customerBusinessId + "\r\n"
            + (patientId == null ? "" : "AND PED.PATIENT_ID = " + patientId + "\r\n")
            + (AppUtil.isNullString(startDate) ? "" : " AND PED.CREATED_DATE BETWEEN '" + startDate + "'\r\n")
            + (AppUtil.isNullString(endDate) ? "" : " AND '" + endDate + "'\r\n")
            + "ORDER BY PED.CREATED_DATE DESC";
    if (Boolean.TRUE.equals(isPagination)) {
        query += "\r\nLIMIT " + page.getPageSize() + " OFFSET " + page.getOffset();
    }
    return query;
}
```

Called with **no bound parameters at all**:
`jdbcTemplate.query(SQL.getAllPatientEncounterDiagnosis(...), mapper)`.

### Why it's written this way — the debugging rationale

The query is assembled and returned as one complete, literal string
(`return query;`) specifically so a developer can put a debugger breakpoint on
that `return` line, inspect the fully-substituted SQL text in the debugger, copy
it out, and run it manually against the database to verify results — without
having to separately reconstruct parameter values against `:namedParam`
placeholders by hand. **This is a deliberate, real trade-off for
debuggability/manual-verification convenience on reporting- and list-style
native queries** — write new queries in this family the same way (single
returned literal string, `Pageable`'s `getPageSize()`/`getOffset()` appended
conditionally for `LIMIT`/`OFFSET`) rather than mixing in bound-parameter
`NamedParameterJdbcTemplate` calls for the same query, which would defeat the
copy-paste-and-run workflow this pattern exists for.

### What this does *not* affect — and the one thing it does

- **`siteId` / `customerBusinessId` / `patientId` are `Long`** — concatenating a
  `Long` into the SQL text cannot introduce SQL syntax (a `Long` has no way to
  carry a quote, a semicolon, or a keyword). Concatenating these specific,
  strongly-typed numeric fields does not create an injection surface, even
  though it is technically not "parameter binding" in the JDBC sense. This is
  the sense in which this pattern **does not affect** the application's
  injection risk for these fields.
- **`startDate` / `endDate` are a different case — verified gap, not a safe
  pattern.** In the real controller
  (`PatientEncounterDiagnosisController.getAllPatientEncounterDiagnosis`), these
  arrive as plain `@RequestParam(required = false) String` — no `@DateTimeFormat`,
  no type constraint, no validation — and are concatenated **directly inside a
  quoted SQL string literal**: `"... BETWEEN '" + startDate + "'"`. A value like
  `2024-01-01' OR '1'='1` (or a more deliberate payload) reaches the executed SQL
  unescaped. **This is exactly the case the baseline rule "SQL must use
  parameters/prepared statements; never concatenate user input" exists to
  prevent, and this method does not currently satisfy it for these two fields.**
  Don't copy this specific part of the pattern into a new query — see the fix
  below.

### How to keep the debug workflow *and* close the gap

The debug-breakpoint/copy-paste workflow only requires that the **final SQL text
be visible and complete at the `return` line** — it does not require the
*inputs* to that text to be unvalidated raw strings. For any free-text/string
input (dates, codes, names — anything that isn't already a narrow, safe type
like `Long`/`Boolean`), validate and normalize it **before** it reaches the
string-building method, so only a known-safe, already-parsed value is ever
concatenated:

```java
// at the controller/service boundary, before calling SQL.getAllPatientEncounterDiagnosis
LocalDate parsedStart = (startDate == null) ? null : LocalDate.parse(startDate); // throws on anything malformed
LocalDate parsedEnd = (endDate == null) ? null : LocalDate.parse(endDate);
```

Then concatenate the **validated, re-formatted** `LocalDate` (via
`DateTimeFormatter.ISO_LOCAL_DATE`, which can only ever render a well-formed
date, never arbitrary text) instead of the raw request string. This preserves
the exact same debuggable, single-returned-string query shape and the same
copy-paste-into-DB workflow, while making it impossible for the concatenated
value to contain SQL syntax — closing the gap without changing the pattern's
intent.

**When writing a new query in this family:** any parameter that is a `Long`,
`Integer`, `Boolean`, or an enum constant may be concatenated directly, per the
existing pattern. Any parameter that is a raw `String` (dates, free-text search,
codes) must be validated/parsed into a safe, narrow type first — never
concatenated as the raw, unvalidated request string.

---

## Pageable handling — the pattern to follow

```java
if (Boolean.TRUE.equals(isPagination)) {
    query += "\r\nLIMIT " + page.getPageSize() + " OFFSET " + page.getOffset();
}
```

- `Pageable`'s `getPageSize()`/`getOffset()` are appended only when
  `isPagination` is true — an explicit opt-out exists for callers that need the
  full result set (e.g., an export/download path) without paging. Both
  `getPageSize()` and `getOffset()` return `long`/`int` values derived from the
  `Pageable` itself, not from unvalidated request input, so this concatenation
  is safe by the same "narrow numeric type" reasoning as `siteId` above.
- The caller wraps the raw row list back into a `Page<T>` with
  `new PageImpl<>(rows, pageable, totalCount)` — `totalCount` must be a genuine
  separate count query result (or a known total), not the size of the current
  page's row list, or `Page.getTotalElements()`/`hasNext()` will be wrong for
  every page after the first.
- For the `NamedParameterJdbcTemplate` style (see `repository.md`), prefer bound
  `LIMIT :limit OFFSET :offset` instead — the `getPageSize()`/`getOffset()`
  concatenation shown here is specific to the string-builder native-query style
  where the whole point is a single literal returned string.

---

## Execution-plan review

For any query against a table expected to grow large (encounter/diagnosis/order
history tables are the clear examples in this codebase), run `EXPLAIN ANALYZE`
against a realistically-sized dataset before merging — a query that looks fine
against a handful of local rows can hide a missing index or an unindexed join
that only shows up under production-scale data.
