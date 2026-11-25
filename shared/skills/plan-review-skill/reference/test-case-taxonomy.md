# Test-Case Taxonomy (D7)

Standards to follow for the actual tests: `shared/standards/testing/README.md` first, then the
layer file (`angular-testing.md`, `java-api-testing.md`, `java-db-testing.md`,
`coverage-and-regression.md`). This file defines **what kinds must be present** in a plan.

Test **cases** (what to verify, for QA and the plan) differ from **self-testing** (what the
implementing engineer or AI agent must run and prove before handing over): see
`self-testing-guidelines.md` (Jasmine+Karma, JUnit 5+Mockito, API tests, evidence block).
Every case below should say whether it is automated by the implementer or run manually.

## Kinds (mark applicable / not applicable with a reason)

| Kind | Covers | Always for |
|---|---|---|
| Functional, happy path | Each requirement row once, per variant (role, order type, module) | all |
| Negative / validation | Empty, whitespace-only, wrong type, too long, missing mandatory | any input |
| Boundary / equivalence | Min/max length, 0/1/many records, date edges, page edges | lists, forms |
| State / workflow | Each status transition, repeat action, already-done, cancelled, reopen | clinical/billing flows |
| Error and resilience | 4xx/5xx, timeout, offline, partial failure, retry, double submit | any API call |
| Concurrency / race | Two users, fast clicks, slow response overwriting user input | async UI |
| Permission / security | Role without access (UI and API), IDOR, XSS/injection text, PHI exposure, audit of who did it | auth, patient data |
| Data integrity | Exactly one record per save, ADD vs UPDATE, orphan/duplicate rows, migration of existing rows | DB changes |
| Integration / contract | Request/response shape, Feign/Kafka consumers, downstream screens, print/report/audit | API/Kafka |
| Regression | Every consumer from the blast-radius matrix; adjacent features sharing the code | all |
| Cross-environment | Behaviour on each affected branch/env (Canary, V2QA, Medvista-QA/UAT, Aster) and customer config | multi-branch |
| Build-mode | **Production-optimised build** as well as dev (minification, tree-shaking, dev-only checks) | UI |
| Browser / device | Chrome, Edge, Firefox; zoom; touch where relevant | UI |
| Accessibility / usability | Keyboard-only, focus return, disabled-state tooltips, messages | UI |
| Performance | Large lists, repeated timers, change-detection cost, query plans, payload size | loops, lists, queries |
| Localisation / formats | Dates, timezones, RTL/Arabic, translations present | UI text, dates |
| Observability | Expected log/trace lines; no new error spam | backend |
| Rollback / upgrade | Revert leaves data readable; old and new build coexisting | DB, API |

## Quality bar per test case

Columns: **ID · Requirement row · Kind · Precondition/data · Steps (numbered, concrete) ·
Expected result (observable) · Environment/branch · Priority (P0-P3) · Automated?**

- "Verify it works" is not a step. Expected results name the toast text, status code, DB
  field, or element state.
- Every requirement-matrix row has ≥ 1 P0/P1 test; every blast-radius row has a regression
  test or a stated reason for exclusion.
- Include the **negative twin** of each happy path (the thing that must still be blocked).
- Data checks name the collection/table and the expected count change (counts only, no PHI).
- A test plan aimed at an unaffected consumer, or one that cannot fail, scores zero for that
  row.

## Minimum set by risk

| Risk | Minimum |
|---|---|
| LOW | functional + negative + regression on the direct consumers |
| MEDIUM | + state, error/resilience, build-mode, cross-environment, permission |
| HIGH/CRITICAL | + data integrity, security, concurrency, performance, rollback, UAT sign-off |

## Scoring hooks

No test file and no approach → D7 ≤ 6 and total ≤ 69. Test file referenced but missing → 0.
Plan with only happy-path UI tests on a shared library → D7 ≤ 8.
