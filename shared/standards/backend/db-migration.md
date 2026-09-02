# BE — Database Migration (Flyway / Mongock)

> Not to be confused with `shared/standards/migration/` (git branch/cherry-pick
> migration between releases) — this file covers schema migration tooling
> (Flyway for Postgres, Mongock for Mongo).
> Also read: `entity.md`, `coding-standards/STANDARDS.md`.

---

## PostgreSQL — Flyway

Configured in **`bootstrap.yml`** (not `application.yml`):

```yaml
flyway:
  enabled: ${FLYWAY_ENABLED:false}
  locations: classpath:db/migration
  baseline-on-migrate: true
  validate-on-migrate: true
```

`enabled` defaults to `false` — Flyway only runs when `FLYWAY_ENABLED=true` is set
for that environment.

**Canonical location — one flat folder, no exceptions**:

```
<project>/src/main/resources/db/migration/
```

Confirmed empty of subfolders in core-service and ipd-service — do not create a
per-module or per-feature subdirectory under `db/migration`. A migration file
placed anywhere else is never picked up.

### Naming convention (real filenames)

```
V100__add_fulltext_search_patient.sql        # versioned — plain integer
V2.6__fix_schema_migration_errors.sql         # versioned — dotted version is valid
R__create_report_builder_views.sql            # repeatable — reruns when its checksum changes
```

- Versioned: `V<version>__<description>.sql` — version can be an integer or
  dotted (`V2.6`). Runs once, in version order.
- Repeatable: `R__<description>.sql` — reruns whenever its content changes.
  A `R__create_report_builder_views.sql` convention (view definitions) appears
  near-identically across core-service, inventory-service, and ipd-service.

**⚠ Gotcha — silently-ignored files**: files without a `V`/`R` prefix (e.g. a
migration named `CREATE_CUSTOMER_MASTER_NAME_TYPE_INDEX.sql` with no `V__`)
are **not applied by Flyway at all** — they just sit in the folder as dead
weight, no error. Real examples of this mistake exist in inventory-service and
ipd-service. Always name a new migration `V<n>__...sql` or `R__...sql`.

### Local dev extras

`config-repo-local/core-development.properties` sets, beyond the bootstrap defaults:

```properties
spring.flyway.repair-on-migrate=true
spring.flyway.mixed=true   # allows non-transactional statements (e.g. CREATE INDEX CONCURRENTLY) inside a migration
```

---

## MongoDB — not a uniform pattern across services

Some Mongo-backed services use **Mongock**; others have **no formal migration
tool at all** and rely on ad-hoc/Spring-Data-auto-index schema evolution.

| Service | Migration tool |
|---|---|
| `ipd-clinical-service` | Mongock |
| `notification-service` | Mongock |
| `appointment-service` | None found |
| `clinical-common-service` | None found |
| `user-management-service` | None found |

### Where Mongock is used

`pom.xml`: `io.mongock:mongock-springboot-v3`.

Package convention: `com.lifetrenz.lths.<service>.migration`, containing:

```java
@ChangeUnit(id = "createPasswordResetIndexes", order = "0001", author = "platform")
public class ChangeUnit0001CreatePasswordResetIndexes {

    @Execution
    public void execution(MongoTemplate mongoTemplate) {
        mongoTemplate.indexOps("password_reset")
            .ensureIndex(new Index().on("token", Sort.Direction.ASC).expire(...));
    }

    @RollbackExecution
    public void rollback(MongoTemplate mongoTemplate) {
        mongoTemplate.indexOps("password_reset").dropIndex("token_1");
    }
}
```

`MongockRunnerConfig.java` wires the runner manually (not `@EnableMongock`) and
**auto-detects replica-set vs standalone Mongo**, toggling
`driver.enableTransaction()` / `disableTransaction()` accordingly.

**⚠ Gotcha**: Mongock's transaction config must match the actual Mongo
deployment. Wiring a Mongock runner with transactions enabled against a
standalone (non-replica-set) Mongo fails at startup with
`"transactionManager not provided"`.

`application.yml`:
```yaml
mongock:
  migration-scan-package:
    - com.lifetrenz.lths.notification.migration
  throw-exception-if-cannot-obtain-lock: true
  lock-acquired-for-millis: 60000
  lock-quit-trying-after-millis: 180000
```

### Where Mongock is NOT used

`appointment-service`, `clinical-common-service`, `user-management-service`
have no `mongock` dependency, no `@ChangeUnit`/`@ChangeLog` classes, and no
migration folder. Schema evolution there is ad-hoc (Spring Data's automatic
index creation from `@Indexed` annotations only) — do not assume a Mongock
migration exists for these services; check before adding one, since introducing
Mongock to a service that has never used it is a bigger change than a normal
migration.

---

## Rules

- A new Postgres migration goes in `src/main/resources/db/migration/` only,
  named `V<n>__description.sql` or `R__description.sql` — never omit the prefix.
- Check the target service's actual `pom.xml`/`bootstrap.yml` before writing a
  Mongo migration — only add a `@ChangeUnit` class if that service already uses
  Mongock (`ipd-clinical-service`, `notification-service`). Otherwise, schema
  changes there are handled by `@Indexed` annotations or ask before introducing
  a new migration tool to that service.
- `FLYWAY_ENABLED` is off by default — a migration you add will not run locally
  unless that env var is set for your environment.
- Because `development → v2-qa` and `v2-qa → medvista-qa` promote via
  cherry-pick rather than full merge (see
  `shared/knowledge/architecture/environments.md`), a migration version number
  free on `development` is not automatically safe on `v2-qa`/`medvista-qa` —
  check the actual applied-migration history on the target environment before
  numbering a new one.

## Migration risk tagging

Tag every migration with a risk level before proposing it — this determines
whether it needs an approval gate (contract §9) and what deployment-window
constraints apply:

| Tag | Examples | Deployment constraint |
|---|---|---|
| **SAFE** | Metadata-only changes (`COMMENT`), adding a nullable column without a default, small new lookup tables, idempotent reference-data inserts | Any deployment window |
| **CAUTION** | Adding an index without `CONCURRENTLY`, adding an FK without `NOT VALID`, modifying a small reference table | Planned window, rollback steps pre-staged |
| **HIGH RISK** | Table rewrites (volatile default on a large table, in-place column-type change), large-data backfills inside the migration, dropping a constraint or column referenced by active code | Requires explicit sign-off, off-hours scheduling, rehearsed rollback — always triggers the contract §9 approval gate regardless of `auto=true` |

Practical notes:
- `ALTER TABLE` takes an `ACCESS EXCLUSIVE` lock in PostgreSQL by default —
  blocks all reads/writes on that table. Adding a `NOT NULL` column with a
  non-volatile default is metadata-only (fast) in PostgreSQL 11+; a volatile
  default (e.g. `now()`) rewrites the whole table.
- Adding `NOT NULL` to an existing column requires every existing row to
  satisfy it — add nullable, backfill, then promote to `NOT NULL`, rather than
  one migration.
- Prefer `CREATE INDEX CONCURRENTLY` for new indexes on large production
  tables (must run outside a transaction — match the project's existing
  no-transaction migration convention).
- Flyway is forward-only in this project — never edit an applied migration;
  a "rollback" is a new forward-fix migration.
