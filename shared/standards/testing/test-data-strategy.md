# Test Data Strategy

## Generated vs. verified-DB-backed data — the core distinction

| | Generated test data | Verified DB-backed test data |
|---|---|---|
| **What it is** | Built in-memory/in-test (builders, `@ParameterizedTest` sources, random-but-seeded values) | Real rows seeded into a real DB (Testcontainers Postgres — see [java-db-testing.md](java-db-testing.md)), with relationships a hand-built DTO can't faithfully represent |
| **Use for** | Input-shape coverage (BVA/EP sweeps), unit/service tests with mocked repositories, anything where the *value* doesn't need to be business-meaningful | Anything whose correctness depends on real joins, FK constraints, cascades, unique indexes, or `siteId`/tenant-scoped queries |
| **Traceability** | Each test builds and owns exactly the data it asserts against | Each test seeds its own named fixture rows in `@BeforeEach`/the test body — never assert against pre-existing Flyway seed/reference data |
| **Cost** | Cheap, fast | Slower (real DB round-trips) — reserve for what actually needs it |

**Decision rule:** if you can name the specific SQL behavior a test is protecting
(a join, a cascade, a unique constraint, a tenant filter), it needs verified
DB-backed data. If the test is really about business logic given some input
shape, generated data plus mocks is faster and just as valid.

## Builders over copy-pasted construction

Prefer a builder/factory method over repeating multi-field object construction
across tests:

```java
private CustomerTransactionAttribute cta(Long siteId) {
    CustomerTransactionAttribute cta = new CustomerTransactionAttribute();
    cta.setActive(true);
    cta.setCreatedOn(new Date());
    cta.setSiteId(siteId);
    return cta;
}
```

This keeps tests focused on what varies (here, `siteId`) rather than re-stating
every field every time, and means a new required field only needs updating in
one place.

## Data setup and cleanup

- **Unit tests (mocked collaborators):** no real data to clean up — this is
  exactly why mocked tests are cheap; don't reach for a real DB when a mock
  suffices (see [java-junit-mockito.md](java-junit-mockito.md)).
- **Integration tests (Testcontainers):** either
  1. Annotate the test `@Transactional` so Spring rolls back after each test
     (cheapest, works when the SUT itself doesn't rely on committed state across
     transactions — see the rollback-testing caveat in
     [java-db-testing.md](java-db-testing.md) about not confusing test-rollback
     hygiene with testing the SUT's own transaction behavior), or
  2. Explicitly delete/reset what the test created in an `@AfterEach`, when
     `@Transactional` rollback isn't appropriate (e.g., testing code that itself
     spans multiple transactions, like the `REQUIRES_NEW` isolation pattern).
- **Non-DB side effects** (files written to disk, Kafka messages produced, cache
  entries set): clean these up explicitly — they are not covered by transaction
  rollback. A test that writes a file and doesn't delete it, or that leaves a
  stale cache entry, can make a *later, unrelated* test fail nondeterministically.

## Never use real PII/PHI as test data

Per `rules/security.md`: never log or persist real PHI/PII in test artifacts.
This extends fully to test *data*:

- Use synthetic patient/user records — realistic shape (valid-looking MRN format,
  plausible name/DOB), never a real patient's actual data copied from
  production/UAT/a support ticket.
- For file-upload fixtures (see
  [java-file-upload-testing.md](java-file-upload-testing.md)), build synthetic
  Excel/PDF/image fixtures with structurally correct headers/content — don't
  reuse a real uploaded document as a test fixture even if it seems convenient.
- If a bug report includes real patient data illustrating the failure, **extract
  the failure's shape** (which fields, what invalid combination) into a synthetic
  fixture — don't check the real data into the test suite as-is.

## Fixture data for large/batch scenarios

See [java-large-data-import-testing.md](java-large-data-import-testing.md) for
the specifics, but the data-strategy principle: generate large fixtures
**programmatically** (e.g., `generateXlsxFixture(50_000)`) rather than committing
a 50,000-row Excel file to source control — a generated fixture is reviewable (the
generation logic is readable), stays in sync with schema changes, and doesn't
bloat repo size.

## Test data across service boundaries

When a test needs data that spans services (e.g., a `CustomerTransactionAttribute`
whose `siteId` must resolve against `customerBusinessSiteRepository`, or a Kafka
message another service would normally produce):

- Prefer seeding the data **at the layer being tested** and mocking the
  producing side, unless the integration between the two services is itself
  what's under test.
- For a genuine cross-service integration test, Testcontainers' `kafka` module
  (confirmed available in `inventory-service`) lets you produce a real message
  and assert real consumption — reserve this for the specific contract-boundary
  tests that need it, not as the default for every Kafka-adjacent test.
