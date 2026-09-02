# Testing Anti-Patterns

Real examples found in this workspace, plus the general anti-patterns they
illustrate. Use this file to recognize a bad pattern before writing it, and to
recognize it in review.

## 1. Raw Codegen recordings committed as tests

**Found:** `Playright-Projects/tests/lifetrenz-flow.spec.ts` — an unedited
Playwright Codegen output: hardcoded plaintext credentials, brittle
position-based selectors (`.nth(2)`), and **zero assertions**.

**Why it's bad:** it proves a recorder could click through a flow once, not that
the application behaves correctly. It will break the moment unrelated UI content
shifts (the `.nth(2)` index changes), and it hardcodes a real-looking credential
in source, which `rules/security.md` explicitly prohibits regardless of whether
it's "just a test."

**Do instead:** see [playwright-e2e.md](playwright-e2e.md)'s worked example —
role-based locators, environment-variable credentials, `test.describe`/fixtures,
and explicit assertions on the outcome.

## 2. Hardcoded credentials in test source

**Found:** the same Playwright spec above.

**Why it's bad:** `rules/security.md` bans hardcoded credentials, tokens, and
environment-specific values everywhere, with no test-code exception — a
credential committed to source control persists in git history even after
rotation/removal, and a real-looking username/password in a public or
widely-shared repo is a genuine exposure, not a cosmetic issue.

**Do instead:** environment variables (`process.env.E2E_USERNAME`), a
gitignored `.env` for local runs, CI secrets for pipeline runs.

## 3. Angular CLI stub masquerading as coverage

**Found:** most `.spec.ts` files in `lifetrenz-core` (`bom-details.component.spec.ts`,
`dashboard.component.spec.ts`, etc.) are still the default generated stub — one
`'should create'` assertion, using the deprecated `async()` helper.

**Why it's bad:** a file existing at `X.component.spec.ts` makes a coverage tool
or a `/test` gap report believe `X.component.ts` has test coverage, when in
reality only "does it construct without throwing" is verified — no logic, no
form validation, no event handling, nothing from
[angular-testing.md](angular-testing.md) is actually covered.

**Do instead:** treat an unreviewed CLI stub as equivalent to "no coverage" when
triaging a coverage gap report (see [test-lifecycle-and-build-isolation.md](test-lifecycle-and-build-isolation.md)'s
"generated / scaffold test" category) — don't let its mere existence suppress a
warning that real coverage is missing.

## 4. Mocking the thing you're testing

```java
// BAD — the assertion only proves Mockito returns what you told it to
@Test
void calculateTotal_returnsExpectedValue() {
    BomConfigurationService mockedService = mock(BomConfigurationService.class);
    when(mockedService.calculateTotal(any())).thenReturn(BigDecimal.TEN);
    assertThat(mockedService.calculateTotal(lineItem)).isEqualTo(BigDecimal.TEN);
}
```

**Do instead:** mock collaborators, never the class/method under test — see
[java-junit-mockito.md](java-junit-mockito.md)'s mock-boundary guidance.

## 5. Verifying "something happened" instead of "the right thing happened"

```java
// BAD — proves a save call occurred, not that it saved the right status
verify(mergeEventRepository).save(any());
```

**Do instead:** `ArgumentCaptor` and assert on the captured value's actual
content — see [java-junit-mockito.md](java-junit-mockito.md).

## 6. Testing framework/library internals

Writing a test that really just confirms Jackson serializes a POJO, or that
Spring's `@Autowired` wiring works — this tests the framework's own test suite's
job, not your code. See [testing-principles.md](testing-principles.md) §8.

## 7. Flaky tests tolerated as "usually passing"

A test that intermittently fails (often from a fixed-duration `Thread.sleep`
racing an async operation, or from Playwright timing against real network
latency) trains engineers to re-run CI instead of investigating failures — which
means a *real* regression can also get re-run-and-ignored. Fix the root cause
(use Awaitility/`fakeAsync`/`waitFor` — see
[java-performance-load-testing.md](java-performance-load-testing.md) and
[angular-testing.md](angular-testing.md)) or delete the test; never leave it
flaky.

## 8. Disabled test silently counted as coverage

A test file exists, has real-looking assertions, but is `@Disabled`/`xit`'d and
has been for months with no tracking. A coverage tool sees the file and may
report the class as "has tests" even though nothing in it runs.

**Do instead:** follow [test-lifecycle-and-build-isolation.md](test-lifecycle-and-build-isolation.md) —
every disabled test carries a reason and a re-review trigger; `testing.md` §8
already says disabled tests must be flagged, not counted.

## 9. Asserting the mock's own default behavior

```java
// BAD — Mockito returns null for unstubbed methods by default; this assertion
// is really just re-proving Mockito's default, not application behavior
@Test
void getOptionalField_whenNotSet_isNull() {
    assertThat(mockedDto.getOptionalField()).isNull(); // mockedDto was never stubbed
}
```

**Do instead:** construct a real DTO instance for anything you're not explicitly
stubbing behavior on — see [java-junit-mockito.md](java-junit-mockito.md)'s
mock-vs-real-object decision rule.

## 10. Duplicate test cases padding a suite without new protection

Six parameterized variants of "invalid string" that all exercise the same
`@NotBlank` check add maintenance cost (every one needs updating if the DTO
changes) without catching anything a single representative case wouldn't. See
[test-case-design.md](test-case-design.md)'s "avoiding meaningless/duplicate test
cases."

## 11. Full-file rejection assumed where the real contract is "skip the bad row"

Writing a test asserting "the whole import fails if row 40,000 is bad" for the
`data-import` flow would test for behavior the system explicitly does not have —
the verified, documented contract is per-row skip, not whole-file rejection (see
[java-large-data-import-testing.md](java-large-data-import-testing.md)). Always
verify the actual documented failure-handling contract before writing the
negative test — don't assume the "obvious" behavior.

## 12. Load-testing logic with a mocked `for` loop

```java
// BAD — measures Java loop overhead against a mock, not real system performance
for (int i = 0; i < 10_000; i++) {
    mockedService.processRequest(request);
}
```

**Do instead:** if load testing is genuinely needed, use a real load-testing tool
against a real running instance — see
[java-performance-load-testing.md](java-performance-load-testing.md)'s decision
rules on when a load test is warranted and what "not currently wired into any
`pom.xml`" means for this workspace today.

## 13. Assuming a tool/library is available without checking

Assuming Testcontainers, Awaitility, ArchUnit, or JaCoCo are available in every
service because `inventory-service` has them — confirmed **not** uniformly true
(`core-service` lacks them at time of writing). Always check the target service's
own `pom.xml`/`package.json` first — see [README.md](README.md)'s verified-stack
table and its rule to check before assuming.
