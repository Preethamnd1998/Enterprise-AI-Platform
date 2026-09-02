# BE â€” Repository Instructions

> Also read: `coding-standards/STANDARDS.md`.

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
- For complex queries use `@Query` with JPQL â€” never native SQL unless unavoidable.

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

---

## Rules

- **Always use parameter binding** â€” never build SQL via string concatenation with user input (SQL injection risk).
- Use `NamedParameterJdbcTemplate` for named parameters; `JdbcTemplate` for positional `?` params.
- Keep SQL strings as `private static final String` constants at the top of the class.
- SQL files for very long queries: store in `src/main/resources/sql/` and load with `@Value`.
- Implement pagination using `LIMIT :limit OFFSET :offset` with bound parameters.
- Prefer keyset pagination for deep paging on indexed columns to avoid full scans.
- Do NOT put any business logic in the repository â€” only data access code.

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
The active filter means `findAll` / `findById` already exclude inactive records â€” no extra `WHERE active = true` clause needed at call sites (as long as the filter is enabled in the session).
