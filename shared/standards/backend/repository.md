# BE — Repository Instructions

> Also read: `coding-standards/STANDARDS.md`, [`sql-query.md`](sql-query.md) for
> how to actually write the SQL/JPQL inside these repositories.

---

## Two Repository Styles

### 1. JPA Repository (preferred for standard CRUD)

Interface name must follow: `I<EntityName>Repository` (prefix `I`).

```java
@Repository
public interface IAutoFollowUpRuleAssignmentRepository
        extends JpaRepository<IpdAutoFollowUpRuleAssignment, Long> {

    List<IpdAutoFollowUpRuleAssignment> findBySiteId(Long siteId, Pageable pageable);

    Optional<IpdAutoFollowUpRuleAssignment> findByIdAndSiteId(Long id, Long siteId);

    boolean existsBySiteIdAndRuleId(Long siteId, Long ruleId);
}
```

- Use Spring Data JPA method naming conventions for simple queries.
- For complex queries use `@Query` with JPQL — never native SQL unless unavoidable.
- See [`sql-query.md`](sql-query.md) for the actual query-writing rules (parameter
  binding, pagination, indexing, etc.) that apply here too.

### 2. Custom JDBC Repository (for complex/performance-sensitive queries)

```java
@Repository
public class AutoFollowUpRuleAssignmentRepository {

    @Autowired
    private NamedParameterJdbcTemplate namedParameterJdbcTemplate;

    private static final String FIND_BY_SITE_SQL =
            "SELECT * FROM ipd_auto_follow_up_rule_assignment " +
            "WHERE site_id = :siteId AND active = true " +
            "LIMIT :limit OFFSET :offset";

    public List<IpdAutoFollowUpRuleAssignment> findBySiteId(Long siteId, int page, int size) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("siteId", siteId)
                .addValue("limit", size)
                .addValue("offset", (long) page * size);
        return namedParameterJdbcTemplate.query(FIND_BY_SITE_SQL, params, new RuleAssignmentRowMapper());
    }
}
```

**A second, real pattern exists in this codebase for reporting/list-style native
queries** — a plain `JdbcTemplate` (not `NamedParameterJdbcTemplate`) executing a
SQL string built by a static builder method (e.g.
`com.lifetrenz.lths.ipd.mrd.query.SQL.getAllPatientEncounterDiagnosis`), with no
bound parameters at all. This is a deliberate style choice with its own rules —
see [`sql-query.md`](sql-query.md)'s "String-built native queries" section before
copying it, since it has a real, confirmed gap that must not be repeated
uncritically.

---

## Repository-layer rules

- Keep SQL/JPQL strings as `private static final String` constants at the top of
  the class (or, for the string-builder style, as a dedicated static method in a
  `*.query.SQL`-style class — see [`sql-query.md`](sql-query.md)).
- SQL files for very long queries: store in `src/main/resources/sql/` and load
  with `@Value`.
- Do NOT put any business logic in the repository — only data access code.
- All query-writing conventions (parameter binding, pagination, `SELECT *`,
  N+1, indexing, batching, transactions, migrations) now live in
  [`sql-query.md`](sql-query.md) — this file only covers repository
  class/interface structure.

---

## RowMapper Pattern (JDBC)

```java
public class RuleAssignmentRowMapper implements RowMapper<IpdAutoFollowUpRuleAssignment> {

    @Override
    public IpdAutoFollowUpRuleAssignment mapRow(ResultSet rs, int rowNum) throws SQLException {
        IpdAutoFollowUpRuleAssignment entity = new IpdAutoFollowUpRuleAssignment();
        entity.setId(rs.getLong("id"));
        entity.setSiteId(rs.getLong("site_id"));
        entity.setRuleId(rs.getLong("rule_id"));
        entity.setActive(rs.getBoolean("active"));
        return entity;
    }
}
```

---

## Soft Delete

All repositories work with soft-deleted entities via `@SQLDelete` + `@Filter` on the entity.
The active filter means `findAll` / `findById` already exclude inactive records — no extra `WHERE active = true` clause needed at call sites (as long as the filter is enabled in the session).
