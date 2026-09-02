# Testing Principles

Written from the perspective of a senior QA architect: testing exists to reduce the
cost of change, not to hit a coverage number. Every rule below exists to serve that
goal.

## 1. What to test

Test **behavior that matters if it breaks**:

- Business rules and calculations (billing, BOM configuration, patient merge logic,
  clinical validation).
- Boundaries between layers you don't fully control (DB, Kafka, Feign calls to other
  services, external APIs).
- Anything with a documented bug history (regression tests for every fixed bug).
- Validation and authorization — the two things that silently fail in production
  without a test catching them first.
- Data transformations where a subtle error compounds (unit conversions, currency
  rounding, date/timezone handling, Excel import parsing).

## 2. Why to test it

Every test should answer: **"What real failure does this catch, and what does it cost
us if that failure reaches production instead?"** If you can't answer that concretely,
the test is likely low value. Common real answers:

- "A future refactor of this pricing formula silently changes an invoice amount."
- "A NPE from a null `siteId` reaches a controller and returns a 500 instead of a
  400 with a clear message."
- "A batch import partially commits half a file and leaves inconsistent inventory
  counts."

## 3. When to use each testing type

| Type | Use when | Don't use when |
|---|---|---|
| Unit test | Testing a single class/method's logic in isolation (service, validator, mapper) | The behavior only makes sense with real Spring wiring, a real DB, or multiple collaborating beans |
| Service/business-logic test | Testing orchestration across mocked collaborators (repositories, other services) | You need to verify actual SQL/JPQL correctness — use a DB integration test instead |
| Controller/API test | Testing request mapping, validation, serialization, HTTP status codes, error responses | You're really testing business logic — push that down to a service-layer unit test and keep the controller test thin |
| Repository/DAO test | Testing actual query correctness (`@Query`, native SQL, JPA derived queries) against a real DB engine | The repository is a plain CRUD pass-through with no custom query — usually not worth a dedicated test |
| Integration test (`*IT`) | Testing multiple real components together (Spring context + real Postgres via Testcontainers, or Kafka) | The unit/service test already gives equivalent confidence at 100x lower cost — don't duplicate |
| Performance/load test | Validating response time or throughput SLAs, or verifying no perf regression on a hot path | As a substitute for correctness testing — perf tests should assume correctness is already proven |
| Concurrency test | Testing race conditions, idempotency guards, optimistic locking, retry/rollback under contention | The code has no shared mutable state or concurrent entry points |
| E2E (Playwright) | Validating a critical user journey end-to-end across UI → API → DB | As a substitute for unit/component tests — E2E is slow, flaky-prone, and expensive to maintain; reserve for golden paths |

## 4. Test-case category coverage

For any non-trivial method/endpoint/component, deliberately walk through:

- **Positive** — the documented happy path(s), including realistic variations (not
  just one canonical input).
- **Negative** — invalid input, missing required fields, wrong types, unauthorized
  callers, resource-not-found.
- **Boundary** — min/max lengths, zero, negative numbers, empty collections, exactly-
  at-limit values (see [test-case-design.md](test-case-design.md) §Boundary-Value
  Analysis).
- **Validation** — every `@NotNull`/`@Valid`/custom constraint actually rejects what
  it claims to reject (see `rules/security.md`'s note on validation for auth/PII
  fields specifically).
- **Error/exception** — the *shape* of the error response (status code, error body
  fields), not just that "something" was thrown.
- **Security** — authorization boundaries (can user A access user B's resource?),
  tenant/site isolation, PHI/PII not leaking into a response that doesn't need it.
- **Regression** — every previously-fixed bug gets a permanent test tied to it (see
  [test-lifecycle-and-build-isolation.md](test-lifecycle-and-build-isolation.md)).

## 5. Data setup and cleanup

- Each test owns its own data — never depend on execution order or leftover state
  from a previous test.
- Prefer builders/factory methods over copy-pasted object construction (see
  [test-data-strategy.md](test-data-strategy.md)).
- Integration tests using Testcontainers get a fresh container per test class (or
  use `@Transactional` + rollback for tests that don't need cross-transaction
  behavior) — never assert against data seeded by migration/Flyway scripts unless
  that's specifically what's under test.
- Clean up anything a test creates that isn't automatically rolled back (files
  written to disk, Kafka topics/messages, cache entries).

## 6. Mock boundaries

- Mock **collaborators you don't own the correctness of in this test** — other
  services (via Feign), repositories (in a pure unit test), external HTTP calls.
- Do **not** mock the class under test's own internal private methods, or value
  objects/DTOs — construct real ones.
- In a DB integration test, don't mock the repository — that's the point of the
  test. Mock only things genuinely external to the DB interaction (e.g., a Feign
  client to another microservice).
- Every test with a mocked external boundary should have this documented in a
  comment or test name — a reviewer should be able to tell what's real and what's
  faked without opening the collaborator's source.

## 7. Maintainability and stability

- A flaky test is worse than no test — it trains engineers to ignore CI failures.
  Fix or delete it; never leave it "usually passing."
- Prefer testing behavior/contract over implementation detail — a test that breaks
  every time you rename a private method or reorder statements (without changing
  behavior) is testing the wrong thing.
- Keep test names descriptive of intent:
  `methodUnderTest_condition_expectedResult` (this convention is already in active
  use — see `PatientMergeServiceRollbackTest` in `core-service`).
- One logical assertion focus per test. Multiple `assertThat`/`assertEquals` calls
  verifying the *same* outcome are fine; testing two unrelated behaviors in one
  `@Test` method is not.

## 8. What should NOT be tested

- Framework code (Spring's DI wiring itself, Lombok-generated getters/setters,
  JPA's own query execution mechanics).
- Third-party library internals (don't write a test that really just verifies
  Jackson serializes a POJO correctly — that's Jackson's test suite's job).
- Trivial one-line delegation with no logic (`return repository.findAll();`)
  unless it's the seam between two systems worth locking down.
- Generated code (`*Generated.java`, `*.g.ts`, `*.g.dart`, `*.freezed.dart`) — see
  `testing.md` §8.
- Private implementation details reachable only through a public method already
  under test — test the public contract, not the internals.

## 9. Practical example — applying this before writing tests

Before generating any test for a change, answer:

1. What is the actual new/changed behavior? (Read the diff, not just the class.)
2. What existing tests already cover adjacent behavior? (Don't duplicate.)
3. What's the minimum high-value test set? (See
   [test-case-design.md](test-case-design.md) §Minimum high-value set.)
4. What's genuinely external and should be mocked vs. what should be real?
5. Does this change touch auth/permissions/secrets/PII? If so, load and apply
   `rules/security.md` before writing assertions — e.g., never assert against or
   log real tokens/PHI in test output.
