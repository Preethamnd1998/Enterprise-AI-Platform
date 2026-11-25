# Plan: <ticket id> <title>

<!-- Fill every section. "N/A" needs a reason. Cite evidence as repo@branch:path:line.
     Reviewers score from this; unverifiable claims are marked UNVERIFIED and cost points. -->

Author: <name> · Date: <date> · Ticket type: BUG FIX | NEW DEVELOPMENT | DATA CORRECTION
Environments/branches affected: <development, V2-QA, Medvista-QA, …>
Risk (contract §9): LOW | MEDIUM | HIGH | CRITICAL — <reason>

## 1. Requirement and symptoms
| # | Symptom / acceptance criterion | Source (journal id, screenshot, BRD) | Plan item | Test case |
|---|---|---|---|---|
Open decisions for BA: <list>

## 2. Root cause (BUG FIX)
Mechanism (file:line, target branch) · evidence (console/log/DB count) · why now/here ·
alternatives ruled out · symptoms NOT explained by this cause.

## 3. Branch matrix
| Repo | Ref (tip date) | Bug present? | Fix/plan code already present? | Evidence |
|---|---|---|---|---|
Promotion path: <cherry-pick onto merge branch from <target> | full release> · Submodule pointer bumps: <list>

## 4. Change Map (REQUIRED for bug fixes; recommended for features)
One row per edit, on **each branch whose lines differ**. Line numbers are those of the target
branch at the stated commit; re-verify after rebase.

| # | Repo@branch (sha) | File | Lines (before → after) | Symbol | Change (one line) | Why (rule/RCA link) | Symptom fixed |
|---|---|---|---|---|---|---|---|
| 1 | ipd-clinical@development (d11b7c4) | src/app/base/util/artifact-utils.ts | L6 → L6 | import | namespace → default import | RCA §2 | 2 |

Before/after snippet for each non-trivial row (≤ 10 lines). Files read-only for context are
listed separately. New files: path + purpose. Deleted code: lines and reason.

## 5. Blast radius
Consumers/copies/submodules (counts + names) · same defect elsewhere (apps, branches) · API,
DB, Kafka, permissions, audit/print/notifications · release path and rebuild list · rollback.
Regression matrix: | Consumer/area | Why affected | Test | Priority |

## 6. Design and scope
Chosen approach · alternatives considered · what is deliberately **not** changed · anything
split into other tickets.

## 7. Test plan (all kinds; see taxonomy)
| ID | Requirement row | Kind | Precondition | Steps | Expected (observable) | Env/branch | Priority | Automated? |
|---|---|---|---|---|---|---|---|---|

## 8. Self-testing plan (the implementer, human or AI agent, must do this)
| Area | Tests to add/run (paths, names) | Command | Done when |
|---|---|---|---|
| Failing-first test (bug) | | | red before fix, green after, reverted-fix check |
| UI Jasmine + Karma | | `ng test --watch=false --browsers=ChromeHeadless --include=<path>` | pass, negative twin, no skipped/focused |
| UI production build | | `ng build --configuration production` + manual flow | flow works in prod build |
| BE JUnit 5 + Mockito | | `mvn test -pl <module>` | pass, ArgumentCaptor/never() on negatives |
| API tests (MockMvc/@WebMvcTest) | | | status, validation, auth |
| API black-box (curl/Postman) | | | happy, negative, unauthorised captured |
| DB / Mongo / Flyway | | `mvn verify` (Docker) | counts/schema checked, no PHI |
| Kafka / async | | | payload, idempotency |
| Regression of consumers | | | listed consumers pass |
| Manual P0/P1 script | | | executed on <env> |
Guidelines: `reference/self-testing-guidelines.md`. Evidence block (Self-Test Evidence) goes
in the MR and the Redmine comment.

## 9. Delivery steps
Ordered steps with a done-when per step · MR targets · who verifies on each environment.

## 10. Not checked / assumptions
<list; each becomes a finding if it matters>
