# Coverage & Regression Policy

This file explains how this knowledge base relates to the `/test` command's
automation contract in [`testing.md`](../testing.md), and adds regression-protection
guidance the contract doesn't currently cover. **`testing.md` remains the
authoritative, machine-enforced source for the `/test` command itself** — nothing
here overrides it.

## Relationship to `testing.md`

`testing.md` defines, and this file does not restate in full: stack detection
(§1), subagent limits (§2), the Phase C **warn-mode** coverage gate (§3), file
naming conventions (§4), the two-gate validation (§5), the output contract (§6),
banned patterns (§7), and the edge-case taxonomy (§8). Read `testing.md` directly
for the exact rules — this file only adds context and extensions on top.

### Current coverage gate (Phase C, warn mode) — as-is

Per `testing.md` §3: any changed file with 0% test coverage triggers a **warning**,
not a build failure. No numeric threshold is enforced yet. Do not treat this
knowledge base as raising that bar to a hard gate — it isn't one, until `testing.md`
itself moves to Phase D+.

### Extension — JaCoCo is available, but not everywhere (not in `testing.md` today)

`inventory-service`'s `pom.xml` wires JaCoCo (`prepare-agent` for both unit and
Testcontainers-integration runs, plus a `report` goal in the `verify` phase). This
means **for that service specifically**, an actual coverage number is
machine-generated (`target/site/jacoco/index.html`) rather than the boolean
"0% or not" signal `testing.md` §3 currently formalizes. This is documentation of
an existing capability, not a new gate — don't fail a build on a JaCoCo number
outside `inventory-service` without adding the plugin there first and getting that
change approved as its own task.

## Regression protection — extension to `testing.md`

`testing.md` §7 already bans deleting existing tests. This section adds the
practical regression discipline `testing.md` doesn't spell out:

1. **Every fixed bug gets a permanent regression test**, named to reference what it
   guards against (not the ticket number — ticket numbers rot; behavior
   descriptions don't). Prefer `PatientMergeServiceRollbackTest`'s style: the class
   Javadoc names the hardening scenario and its root cause in prose, the test
   method name states condition → expected result.
2. **A regression test must fail against the pre-fix code.** If you can't
   demonstrate that (e.g., by reverting the fix locally and re-running), the test
   may not actually be exercising the bug's code path.
3. **Regression tests are permanent** — see
   [test-lifecycle-and-build-isolation.md](test-lifecycle-and-build-isolation.md)
   for how they're distinguished from temporary/exploratory tests that are allowed
   to be commented out later.
4. Contract/API regression: when a controller's request/response shape changes,
   check for and update — never silently delete — the API test asserting the old
   shape; if the change is a deliberate breaking change, that's a two-person
   decision (see `testing.md` §7's "no test deleted without explicit approval").

## Reading a coverage gap report (per `testing.md` §3 format)

```
COVERAGE GAP REPORT
===================
Files changed:   <N>
Files with tests: <M>
Files missing tests (0% coverage): <list>

Warning: <K> changed files have no test coverage.
         Add tests or add to .ai-platform/coverage.yml allow-list.
```

When triaging this list, prioritize by [testing-principles.md](testing-principles.md)
§1 ("what to test"), not by file order — a missing test on a validator or a
money-calculation class outranks a missing test on a thin DTO mapper.

## Do not contradict `testing.md` §7 (banned patterns)

In particular, when using this knowledge base to *write* tests (as opposed to just
planning them), the `/test` command's own invocation still must not: run tests
without confirmation, modify production code, add dependencies without approval,
use real PII/credentials as test data, delete existing tests, or touch
`@SpringBootApplication`/bootstrap code. This knowledge base's Java/Angular/
Playwright guidance assumes those constraints are already in force during `/test`
runs; they don't apply the same way to a manually-approved, human-directed testing
task outside `/test` (e.g., a `dev` skill task explicitly asked to add a
Testcontainers dependency) — but even then, get explicit approval first, per
`testing.md` §7's dependency rule.
