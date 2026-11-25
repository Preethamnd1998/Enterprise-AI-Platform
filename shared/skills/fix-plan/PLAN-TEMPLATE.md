# Fix Plan layout

Headings in this order. A section with nothing to say states why, it is not dropped.

```markdown
# Fix Plan — #<id> <subject> (round <n>)

- **Reported by / date / environment / branch:** ...
- **Care settings in scope:** IP / OP / ER / Day Care (say which and why)
- **Risk:** Low | Medium | High | Critical (High/Critical → approval before build)

## 1. What QA saw
One short paragraph per defect; one defect per heading. Quote the ticket line.

## 2. Evidence
Table of the rows that prove it (datasource, date, ids abbreviated, states, timestamps).
Population query: counts for every care setting, with the resolvable-vs-total denominator.

## 3. Root cause
Mechanism, `path:line`, why it worked before and fails now (ticket/commit/date), how it differs from
earlier rounds. Each claim tagged verified | suspected.

## 4. Fix
Behaviour table: current state → outcome. Guards and their fallbacks. Server-side enforcement.
Contract compatibility (old and new forms). Rejected alternatives and why.

## 4b. Change Map (bug fixes; line numbers read from each branch)
| # | Repo@branch (sha) | File | Lines (before → after) | Symbol | Change | Why (RCA link) | Symptom |
|---|---|---|---|---|---|---|---|
One row per edit, one per branch where lines differ (`git show <ref>:<path>`). Before/after snippet for
non-trivial rows. Also list tests, translations, sibling apps and submodule pointer bumps the fix needs.

## 4c. Blast radius
Consumers and callers (counts), per-app copies and submodules, same defect in sibling apps/branches,
API / DB / Kafka / permissions / audit / print, release path and rebuild list, rollback. Regression matrix:
consumer or area → why affected → test → priority.

## 5. Acceptance map
Each ticket scenario / acceptance criterion → the part of the fix that meets it → the test that proves it.

## 6. Verification
Tests (name, case count, seam). Compile per branch. Baseline comparison. Not run: ...

**Self-testing plan** (for whoever builds it, human or AI agent; see `plan-review-skill`
`reference/self-testing-guidelines.md`):
| Area | Tests to add/run (paths, names) | Command | Done when |
|---|---|---|---|
| Failing-first test | | | red before fix, green after, reverted-fix check |
| UI Jasmine + Karma | | `ng test --watch=false --browsers=ChromeHeadless --include=<path>` | pass, negative twin, none skipped/focused |
| UI production build | | `ng build --configuration production` + manual flow | flow works in prod build |
| BE JUnit 5 + Mockito | | `mvn test -pl <module>` | pass, captor and never() on negatives |
| API tests + black-box call | | MockMvc/`@WebMvcTest`; curl/Postman | happy, negative, unauthorised |
| DB / Mongo / Flyway / Kafka | | `mvn verify` (Docker) | counts/schema checked, no patient data |
| Consumer regression | | | listed consumers pass |
After the build, paste the **Self-Test Evidence** block (commands, counts, red→green proof, not run).
Test cases cover all kinds (happy, negative, boundary, state, error, concurrency, permission, data,
integration, regression, cross-environment, build-mode).

## 7. Branches, MRs, deploy
| Branch | Repo A | Repo B |  — plus deploy order and inert-without-the-other note.

## 8. QA retest
Numbered steps per care setting with the expected result. Final step: unchanged paths still behave.

## 9. Not covered
Each item: what stays broken, why, who or what follows up. Earlier bad data cleanup.

## 10. Review gate result
Block / Fix / Note items found, and what changed because of them.

**Score history** (`plan-review-skill`, 100-point rubric):
| Round | Plan | Score / verdict | Caps hit | Gaps closed |
|---|---|---|---|---|
| 1 | first draft or the plan received | N / VERDICT | | |
| 2 | revised (projected until re-review) | N / VERDICT | | |
Old score kept unchanged; revised score is projected until a re-review confirms it. Max 3 rounds;
target 90+. Author-only gaps are listed as `OPEN:`.
```
