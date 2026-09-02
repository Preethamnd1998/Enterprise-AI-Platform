# Test Lifecycle & Build Isolation

The problem this file solves: an AI agent (or engineer) writes a test to verify a
fix or explore a hypothesis during a task. That test is valuable *in the moment*
but was never meant to be permanent regression coverage. If it's left in the
normal test tree unmanaged, a later, unrelated change to production code can make
it fail for reasons that have nothing to do with the change being made —
breaking builds and eroding trust in CI failures. This file defines how to keep
that from happening **without deleting real test value and without silently
weakening the permanent regression suite.**

## The three categories — classify every test into exactly one

| Category | Definition | Lifecycle |
|---|---|---|
| **Permanent regression test** | Locks in a fixed bug, a documented business rule, or a security/authz boundary. Named after the behavior, per [coverage-and-regression.md](coverage-and-regression.md). | Lives in the normal test tree forever. Always runs. Never commented out, never `@Disabled`, never deleted (per `testing.md` §7). |
| **Temporary / exploratory test** | Written to verify a hypothesis, debug a specific issue, or benchmark something once — not meant to protect against a specific regression going forward. | Excluded from the default run (see mechanisms below) once its immediate purpose is served, but kept discoverable for reuse. Reviewed periodically — either promoted to permanent, or deleted. |
| **Generated / scaffold test** | Framework-generated boilerplate (Angular CLI's `'should create'` stub, an AI-scaffolded skeleton not yet reviewed). | Not counted as real coverage (see `testing.md` §8's existing rule on disabled tests — apply the same non-counting principle here) until a human/agent has actually reviewed and filled in real assertions. |

**This classification must happen at the moment the test is written** — don't
defer "is this permanent or temporary?" to some later cleanup pass; decide it as
part of writing the test, and apply the right mechanism immediately.

## Preferred mechanism: framework-native disable, not raw comments

**Use `@Disabled` (Java/JUnit 5) or `xit`/`xdescribe`/`.skip`/`.todo`
(Jasmine/Jest), not a commented-out code block, whenever the test lives in the
normal test tree.** This is already `testing.md` §8's rule for disabled tests
("flag as 'test exists but disabled' — not counted as coverage") — this file
extends that into a full lifecycle policy, it doesn't introduce a new mechanism.

**Hard rule: the default build/test run must never fail or be blocked because
of a temporary, exploratory, or currently-broken test.** Disabling it via the
framework-native mechanism is how that guarantee is met — the test still
compiles (so it isn't silently rotting) but does not execute (so it cannot
fail the run). It is not a workaround to reach for only in the "temporary
test" case above — it is the correct move any time a test would otherwise
break the build and isn't being fixed in the same change. When the engineer
or user is ready, they fix the test and remove the disable marker — it
resumes running on the very next test invocation, with no other step
required. Never leave the build broken as a way to force a later cleanup, and
never reach for commenting the test out as a substitute for this — that
trades a build failure for invisible rot instead of removing the risk (see
below).

**Why this beats commenting out the code:** a `@Disabled` test still *compiles*.
If a later change to production code breaks the disabled test's compatibility
(a renamed method, a changed signature), the build tells you immediately. A
commented-out test is invisible to the compiler — it can silently rot for months,
and the person who eventually uncomments it discovers it doesn't even compile
anymore, with no idea whether that's because the test was wrong or the
production code changed underneath it.

```java
@Disabled("Temporary — written to verify BUG-4821's fix manually during debugging. "
        + "Not a permanent regression test (the permanent one is coverageMatrix_x_y "
        + "above). Re-review by 2026-09-30: promote to permanent if still valuable, "
        + "otherwise delete.")
@Test
void exploratoryCheck_specificEdgeCaseDuringDebugging() {
    // still compiles, still type-checked — just doesn't run by default
}
```

```typescript
// Temporary — exploratory check while investigating the countdown timer race.
// Re-review: promote to a real spec or delete once the investigation closes.
xit('exploratory: countdown behavior under rapid setError calls', () => { ... });
```

Both are already handled correctly by `testing.md` §8's existing edge-case rule —
a `/test` run flags these as "exists but disabled," not silently invisible and
not counted as coverage.

## Extension (not in `testing.md` today): tag-based exclusion for Java

For a **larger** batch of temporary/exploratory tests (e.g., a set of one-time
performance benchmarks — see
[java-performance-load-testing.md](java-performance-load-testing.md)), `@Disabled`
one-by-one is noisy. The cleaner pattern, **proposed as an extension** — not
currently wired into any `pom.xml` in this workspace, so get it approved and add
it explicitly before relying on it:

```java
@Tag("exploratory")
class BatchSizeThroughputBenchmarkTest {
    @Test
    void throughputAt500VsAt2000BatchSize() { ... }
}
```

```xml
<!-- surefire/failsafe config addition — proposed, not yet present -->
<configuration>
    <excludedGroups>exploratory</excludedGroups>
</configuration>
```

This keeps exploratory tests compiling and runnable **on demand**
(`mvn test -Dgroups=exploratory`) without them running — and therefore without
them able to break — the default build.

## The literal "comment it out" pattern — when it's actually appropriate

There is one narrow case where commenting out is the right call: a **single-run,
throwaway verification snippet** that was never written as a real `@Test` method
at all (e.g., a quick manual check run once via a `main` method or a REPL-style
scratch file, not committed as part of the permanent suite) but that an agent or
engineer wants to leave *in place, visible, and easy to reuse* for the next
person who touches this code — without it being mistaken for live production or
test code, and without needing a `@Tag`/dependency setup for a truly one-off case.

**Required marker format when this pattern is used:**

```java
// [AI-TEMP-TEST — commented out after execution, do not delete without review]
// Purpose: one-off manual verification that BomConfigurationServiceImpl.calculateTotal
//          handles a zero-quantity line item correctly (BUG-5190).
// Status: verified passing on 2026-08-29 against commit <short-sha>. Not promoted to a
//          permanent test because <reason — e.g. "covered by the BVA suite in
//          BomConfigurationServiceImplTest already, this only re-confirmed it manually">.
// To reuse: uncomment, confirm it still compiles against current signatures, run manually.
//
// @Test
// void manualCheck_zeroQuantityLineItem() {
//     BigDecimal total = service.calculateTotal(lineItemWithZeroQuantity());
//     assertThat(total).isEqualByComparingTo(BigDecimal.ZERO);
// }
```

**Rules for this pattern:**
- Only for tests that were **already run and their result recorded** in the
  marker comment — never comment out a test that hasn't been executed, since
  then there's no verified value being preserved.
- Always state *why* it wasn't promoted to a permanent test (usually: "already
  covered elsewhere" or "genuinely one-off, not a regression risk") — an
  unexplained commented-out test is indistinguishable from abandoned dead code
  the next person will (correctly) want to delete.
- Prefer `@Disabled`/`@Tag` (above) whenever the snippet is already a proper
  `@Test` method in the main suite — reach for raw comments only for genuinely
  throwaway, never-committed-as-a-real-test snippets as described above.
- These blocks get reviewed on the same cadence as any other temporary test (see
  below) — they are not a way to permanently bury code review debt.

## Review cadence — temporary tests must not become permanent by accident

- Every `@Disabled`/`@Tag("exploratory")`/AI-comment-marker test carries a reason
  and, ideally, a re-review trigger (a date, or "re-review when X ships").
- Treat an unreviewed backlog of disabled/exploratory tests the same way as any
  other tech debt — surface it, don't let it silently accumulate. A `/test`
  invocation's coverage gap report (`testing.md` §3/§6) already reports disabled
  tests as "exists but disabled, not counted" — use that visibility as the trigger
  to periodically triage: promote to permanent, or delete.
- **Never let a temporary test quietly satisfy `testing.md`'s coverage
  expectations** — see [testing-anti-patterns.md](testing-anti-patterns.md)'s
  "disabled test counted as coverage" anti-pattern. A disabled test is
  documentation of intent, not protection.

## What must never happen

- The build failing because of a temporary, exploratory, or currently-broken
  test that should have been disabled instead. If a test is going to block the
  build and isn't being fixed right now, disable it via the framework-native
  mechanism in the same change — don't leave it red.
- A permanent regression test disabled/commented out "temporarily" to unblock a
  build, then forgotten — this silently reopens whatever regression it was
  protecting against. If a regression test is genuinely wrong (testing behavior
  that legitimately changed on purpose), fix or replace it in the same change
  that changed the behavior — don't disable and move on.
- Raw comment-out used on a test that's still an active, uncommented `@Test`
  elsewhere with different content — that's just dead code, not lifecycle
  management; delete it instead (per the "generated code"/dead-code guidance in
  [testing-anti-patterns.md](testing-anti-patterns.md)).
- Relying on `@Tag("exploratory")`/`excludedGroups` before it's actually been
  added to the target service's `pom.xml` and approved — until then, use
  `@Disabled` (already consistent with `testing.md` §8, no approval needed) as the
  default mechanism.
