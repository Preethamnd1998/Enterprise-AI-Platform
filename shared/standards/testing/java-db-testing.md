# Repository/DAO, Integration, Transaction & Migration Testing

**Verified stack:** PostgreSQL (via `org.postgresql:postgresql`), Flyway
(`flyway-core` + `flyway-database-postgresql`), Spring Data JPA. Testcontainers
(`org.testcontainers:postgresql`, `:kafka`, `:junit-jupiter`) is wired in
**`inventory-service`'s `pom.xml` only**, with an explicit rationale comment:
*"the service's native SQL is Postgres-specific (jsonb, trgm), so integration
tests run against a real PostgreSQL container, not H2."* **Check the target
service's `pom.xml` before assuming Testcontainers is available** — it is not in
`core-service` as verified.

## Repository/DAO testing — when it's worth a dedicated test

| Situation | Worth a dedicated test? |
|---|---|
| Plain CRUD, no custom query (`JpaRepository<Entity, Long>` with no extra methods) | No — Spring Data's own tests cover this |
| Custom `@Query` / native SQL, especially Postgres-specific (`jsonb`, `trgm`, window functions) | Yes — this is exactly what `inventory-service`'s Testcontainers setup exists for |
| Derived query method with non-trivial semantics (`findByStatusInAndCreatedOnBefore`) | Yes — verify the actual generated query matches intent, not just that it compiles |
| A query that must respect `siteId`/tenant scoping | Yes — always; this is a security-relevant boundary (see `rules/security.md`) |

## Integration testing with Testcontainers (`*IT` / `*IntegrationTest`)

Per `inventory-service`'s Maven config: unit tests (`*Test`/`*Tests`) run under
`surefire` in the normal `test` phase; integration tests (`*IT`/`*IntegrationTest`)
run under `failsafe` in the `verify` phase and **require Docker** to be running.

```java
@Testcontainers
@SpringBootTest
class BedCategoryRepositoryIT {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("inventory_test");

    @DynamicPropertySource
    static void configureDataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired private BedCategoryRepository repository;

    @Test
    void findActiveBySite_excludesInactiveAndOtherSites() {
        BedCategory active = repository.save(bedCategory("ICU", siteId(1L), true));
        repository.save(bedCategory("Ward", siteId(1L), false)); // inactive
        repository.save(bedCategory("ICU", siteId(2L), true));   // other site

        List<BedCategory> result = repository.findActiveBySite(1L);

        assertThat(result).containsExactly(active);
    }
}
```

**Decision rule — `*IT`/`*IntegrationTest` naming is not cosmetic**: the
failsafe/surefire split in `inventory-service`'s `pom.xml` depends on it to keep
fast unit tests separate from Docker-dependent integration tests. Get the suffix
right or the test silently runs in the wrong phase (or not at all in CI stages
that only run `mvn test`, not `mvn verify`).

**Why real Postgres, not H2:** if the queries under test use `jsonb`, `trgm`
(trigram similarity), array operators, or other Postgres-specific SQL, H2's
Postgres-compatibility mode does not faithfully emulate them — a query can pass
against H2 and fail against real Postgres. This is the documented reason
Testcontainers was chosen for `inventory-service`; apply the same reasoning before
choosing H2 for any other service's DB tests.

## Transaction / rollback testing

Two distinct things get called "transaction testing" — know which one you mean:

**1. `@Transactional` test rollback (test isolation mechanism):** annotate the test
itself `@Transactional` so Spring rolls back everything after each test — cheap
test-data isolation, *not* a test of your transaction logic.

```java
@SpringBootTest
@Transactional // rolls back after each test — this is test hygiene, not the SUT's behavior
class BomConfigurationServiceIT {
    @Test
    void createBomConfiguration_persists() { ... }
}
```

**2. Testing the SUT's own transactional behavior (what actually needs testing):**
does a failure partway through a multi-step operation actually roll back what it
should, and *not* roll back what it shouldn't?

The `PatientMergeService` rollback hardening in `core-service` is the reference
example: `persistTerminalStateIsolated` deliberately runs in a
`REQUIRES_NEW`-propagated transaction specifically so that persisting
`FAILED_UNRECOVERABLE` **survives** even when the caller's own transaction is
poisoned/about to roll back. A test for this must prove the isolation actually
works — not just that the method was called (see the `self`-mock note in
[java-junit-mockito.md](java-junit-mockito.md)):

```java
@Test
void rollbackFailure_persistsFailedUnrecoverable_evenWhenCallerTransactionIsPoisoned() {
    // simulate the caller transaction already being marked rollback-only
    doThrow(new OptimisticLockException()).when(mergeEventRepository).save(any());

    patientMergeService.initiateAutoRollback(MERGE_ID);

    // isolated REQUIRES_NEW path must still be invoked despite the poisoned caller tx
    verify(self).persistTerminalStateIsolated(eq(MERGE_ID), any());
}
```

At the integration level (Testcontainers), the equivalent test would actually
throw mid-transaction and assert the row's final committed status in the real DB
— proving the isolation, not just the call graph.

**Decision rule:** Use pure Mockito (unit-level) to test *that the code takes the
isolated path*; use a Testcontainers integration test to prove *the isolation
actually holds against a real transaction manager* — a pure mock test cannot prove
real transactional isolation, since Mockito never runs real transactions.

## Data-integrity verification

- Unique constraints: assert the expected exception/response when violated (don't
  let a raw `DataIntegrityViolationException` reach an API test unexamined — see
  [java-api-testing.md](java-api-testing.md)'s negative-case guidance).
- Foreign-key/cascade behavior: verify delete/update cascades match the documented
  contract (e.g., does deleting a `BedCategory` cascade to `Bed` rows, or is it
  blocked?) — this is exactly the kind of thing that silently changes when someone
  edits an entity's `@OneToMany`/`@ManyToOne` mapping without noticing.
- `siteId`/tenant isolation: a query missing a `WHERE site_id = ?` clause is a data
  leak, not just a bug — always cover this for any new tenant-scoped query (see
  `rules/security.md`).

## Migration testing (Flyway)

- New migrations should be tested against a **fresh** Testcontainers Postgres
  instance running the full migration chain from V1 — not just applied
  incrementally on top of a developer's already-migrated local DB, which can hide
  ordering/dependency bugs.
- For a migration that transforms existing data (not just schema), write a test
  that: seeds pre-migration-shaped rows, runs the migration, and asserts the
  post-migration data matches the expected transformation — this is different from
  (and complements) a one-off data-correction script for production data, which is
  reviewed manually rather than covered by automated tests.
- Never edit a Flyway migration that has already shipped to a shared environment —
  add a new migration instead. A test suite that mutates and re-runs an already-
  applied migration file doesn't reflect what actually happens in a real
  environment (Flyway checksums the applied migration).

## What NOT to do here

- Don't spin up a full Testcontainers Postgres for a query with no custom SQL —
  that's paying integration-test cost for unit-test-level risk.
- Don't assert against Flyway-seeded reference data by exact expected row content
  in a test not specifically about that seed data — seed data changes over time
  and unrelated tests will start failing.
- Don't add Testcontainers to a service's `pom.xml` "just in case" — per
  `testing.md` §7, dependency additions need explicit approval; propose it when a
  real Postgres-specific query needs it, referencing the same rationale
  `inventory-service` already documented.
