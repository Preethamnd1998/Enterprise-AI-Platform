# Testing Knowledge Base

This is the practical, enterprise-grade testing knowledge base for this workspace's
Java/Spring Boot microservices, the Angular frontend, and Playwright E2E automation.
It is written for both engineers and AI agents (`/test`, `bug-fix`, `new-development`,
`dev` skills) to use when designing or writing tests.

> **This is guidance, not the automation contract.** The machine-enforced rules for
> the `/test` command (stack detection, subagent limits, output contract, banned
> patterns) live in [`testing.md`](../testing.md) and are unchanged by this knowledge
> base — see [coverage-and-regression.md](coverage-and-regression.md) for how the two
> relate. Nothing here overrides `testing.md`; where this knowledge base recommends
> something `testing.md` doesn't yet cover, it's marked as an **extension**, not a
> contradiction.

## Verified stack (do not assume beyond this without checking the target service)

| Layer | Confirmed tooling | Where verified |
|---|---|---|
| Backend | Spring Boot 3.3.0, Java 21, JUnit 5 + Mockito (`spring-boot-starter-test`) | all `UI-BE/*/pom.xml` |
| Backend integration | Testcontainers (`postgresql`, `kafka`, `junit-jupiter`) | `UI-BE/inventory-service/pom.xml` only |
| Backend async/polling | Awaitility 4.2.1 | `UI-BE/inventory-service/pom.xml` only |
| Backend batch | `spring-batch-test` | `UI-BE/inventory-service/pom.xml`; `spring-boot-starter-batch` used by `core-service` too |
| Architecture rules | ArchUnit (`archunit-junit5`) | `UI-BE/inventory-service/pom.xml` only |
| Coverage | JaCoCo | `UI-BE/inventory-service/pom.xml` |
| Frontend | Angular 17, Jasmine + Karma | `UI-BE/lifetrenz-core/package.json` |
| E2E | Playwright `@playwright/test` | `Playright-Projects/package.json` |
| React | **Not present anywhere in this workspace** | — |

**Rule:** Testcontainers/Awaitility/ArchUnit/JaCoCo are proven patterns in
`inventory-service` but are **not yet in every service's `pom.xml`**. Before
recommending or writing a test that depends on one of these, check that specific
service's `pom.xml` first. If it's missing and genuinely needed, propose adding it
explicitly — don't silently assume it's there.

## How to use this knowledge base

1. Start with [testing-principles.md](testing-principles.md) for the philosophy —
   what to test, why, and what NOT to test.
2. Use [test-case-design.md](test-case-design.md) whenever you need to derive a test
   case list for a feature, bug, or endpoint.
3. Jump to the layer-specific file for implementation technique:
   - Java: [java-junit-mockito.md](java-junit-mockito.md), [java-api-testing.md](java-api-testing.md),
     [java-db-testing.md](java-db-testing.md), [java-file-upload-testing.md](java-file-upload-testing.md),
     [java-large-data-import-testing.md](java-large-data-import-testing.md),
     [java-performance-load-testing.md](java-performance-load-testing.md)
   - Angular: [angular-testing.md](angular-testing.md)
   - React: [react-testing.md](react-testing.md) (reference only — no React app exists here yet)
   - E2E: [playwright-e2e.md](playwright-e2e.md)
4. [test-data-strategy.md](test-data-strategy.md) — how to set up and tear down data,
   and the generated-vs-verified-DB-backed data distinction.
5. [coverage-and-regression.md](coverage-and-regression.md) — how this knowledge base
   relates to the `/test` command's coverage gate and two-gate validation.
6. [test-lifecycle-and-build-isolation.md](test-lifecycle-and-build-isolation.md) —
   how temporary/exploratory tests are kept from breaking future builds.
7. [testing-anti-patterns.md](testing-anti-patterns.md) — real anti-patterns found in
   this workspace, and what to do instead.

## File index

| File | Purpose |
|---|---|
| `testing.md` | **Existing** — `/test` command automation contract (unchanged) |
| `testing-principles.md` | Core testing philosophy: what/why/when, what not to test |
| `test-case-design.md` | Test case design techniques (BVA, EP, decision tables, etc.) |
| `java-junit-mockito.md` | JUnit 5 + Mockito fundamentals, unit vs service-layer testing |
| `java-api-testing.md` | Controller/API testing, generated vs DB-verified test data |
| `java-db-testing.md` | Repository/DAO, integration, transaction/rollback testing |
| `java-file-upload-testing.md` | Excel/CSV/image/PDF upload validation testing |
| `java-large-data-import-testing.md` | Large Excel/import: batch, memory, partial failure, retry |
| `java-performance-load-testing.md` | Response-time, load, and concurrency testing |
| `angular-testing.md` | Jasmine/Karma component/service testing |
| `react-testing.md` | Jest + React Testing Library (reference — not in use here yet) |
| `playwright-e2e.md` | Playwright E2E as an optional automation layer |
| `test-data-strategy.md` | Data setup/cleanup, generated vs. verified data |
| `coverage-and-regression.md` | Coverage policy, regression protection, relation to `/test` |
| `test-lifecycle-and-build-isolation.md` | Keeping temp/exploratory tests from breaking builds |
| `testing-anti-patterns.md` | What NOT to do, with real examples from this workspace |
