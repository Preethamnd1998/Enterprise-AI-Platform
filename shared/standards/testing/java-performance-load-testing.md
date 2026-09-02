# API Response-Time, Load, and Concurrency Testing

**Verified tooling:** Awaitility 4.2.1 (`inventory-service` only — check before
assuming it's available elsewhere) for polling/async assertions. **No dedicated
load-testing tool (JMeter/Gatling/k6) was found configured in any service's
`pom.xml` in this workspace** — don't assume one is wired into the build; if a
task genuinely needs load testing, that's an explicit tooling addition to propose
and get approved (per `testing.md` §7), not something to invent silently.

## Response-time testing — where it belongs

- **In the unit/controller test suite**: a loose, generous sanity bound on a
  handful of genuinely critical endpoints (see the example in
  [java-api-testing.md](java-api-testing.md)) — this exists to catch a gross
  accidental regression (an N+1 query introduced into a hot path), not to enforce
  an SLA. CI hardware is not representative of production; a tight assertion here
  produces flaky failures, not real signal.
- **Real SLA verification**: belongs in a dedicated, separately-run load test
  against a realistic environment (not the unit-test CI stage) — see below.

## Load testing — decision rules

**Use a load test when:**
- Verifying a documented throughput/response-time SLA under realistic concurrent
  traffic.
- Checking for a regression before a release on a path known to be
  performance-sensitive (large-import execution, a frequently-polled status
  endpoint, a report/export endpoint against a large dataset).
- Capacity planning — determining how many concurrent users/requests a service
  handles before degrading.

**Don't use a load test when:**
- The question is really "is this code correct," not "is this code fast enough" —
  that's a unit/integration test.
- No tool is currently wired into the target service's build — don't hand-roll an
  ad-hoc load generator inside a JUnit test as a substitute; that produces
  unreliable numbers and couples load-testing infrastructure into the regular test
  suite in a way `testing.md` §7 would flag (running load generation isn't
  "analysis," it's execution against a running system).

**If a load-testing tool is later added** (JMeter, Gatling, k6, or Spring's own
`RestTemplate`/`WebClient`-driven concurrent-request harness for a lightweight
in-process check), document the choice and its config here as an update to this
file — don't let load-test tooling decisions live only in a script no one else
can find.

## Concurrency testing

Use when code has shared mutable state, optimistic/pessimistic locking, or an
idempotency guard meant to survive concurrent invocation — exactly the shape of
the `PatientMergeService` rollback hardening (see
[java-db-testing.md](java-db-testing.md)): `initiateAutoRollback` must be a no-op
when the event is already `ROLLING_BACK`, which is precisely an idempotency
guard against concurrent/duplicate triggering (e.g., a retry firing while the
first attempt is still in flight).

### Testing an idempotency guard directly (no real threads needed)

Most idempotency-guard bugs don't need real concurrency to catch — they need the
*state* two concurrent callers would race to see:

```java
@Test
void initiateAutoRollback_calledTwiceInSequence_secondCallIsNoOp() {
    // simulates the state a second concurrent caller would observe after the first wins the race
    when(mergeEventRepository.findById(MERGE_ID))
        .thenReturn(Optional.of(eventWithStatus(MergeStatus.ROLLING_BACK)));

    patientMergeService.initiateAutoRollback(MERGE_ID);

    verify(mergeEventRepository, never()).save(any());
}
```

### Testing actual concurrent execution (when the guard's real correctness under a race matters)

```java
@Test
void initiateAutoRollback_concurrentInvocations_onlyOneProceeds() throws InterruptedException {
    int threads = 10;
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    CountDownLatch ready = new CountDownLatch(threads);
    CountDownLatch go = new CountDownLatch(1);
    AtomicInteger proceededCount = new AtomicInteger();

    for (int i = 0; i < threads; i++) {
        pool.submit(() -> {
            ready.countDown();
            awaitUninterruptibly(go);
            if (patientMergeService.tryInitiateAutoRollback(MERGE_ID)) {
                proceededCount.incrementAndGet();
            }
        });
    }
    ready.await();
    go.countDown();
    pool.shutdown();
    pool.awaitTermination(5, TimeUnit.SECONDS);

    assertThat(proceededCount.get()).isEqualTo(1); // exactly one winner, not zero, not many
}
```

**This needs a real DB (Testcontainers) or a real locking mechanism under test** —
a pure-Mockito version of this test proves nothing about a real race, since
Mockito mocks aren't thread-contended the way a real DB row lock or
`synchronized`/`ReentrantLock` is. Reserve the multi-thread version for the
integration-test suite (`*IT`), and use it to test the actual locking mechanism
(DB row lock, `SELECT ... FOR UPDATE`, optimistic-lock retry, or a distributed
lock if one is in play) — not the business logic layered on top of it, which the
sequential unit test above already covers cheaply.

### Awaitility for async completion, not busy-loops

```java
await().atMost(Duration.ofSeconds(10))
       .pollInterval(Duration.ofMillis(200))
       .untilAsserted(() -> assertThat(mergeEventRepository.findById(MERGE_ID))
               .hasValueSatisfying(e -> assertThat(e.getStatus()).isEqualTo(MergeStatus.ROLLED_BACK)));
```

Never replace this with a fixed `Thread.sleep(n)` followed by a single assertion —
that's either too short (flaky) or too long (slow suite) and gives no margin.

## What NOT to do

- Don't assert exact wall-clock numbers in CI (`assertThat(elapsed).isEqualTo(120)`)
  — assert bounds, and generous ones, in the regular suite.
- Don't simulate "load" with a `for` loop calling a mocked service — that measures
  Java loop overhead, not the system's actual performance characteristics.
- Don't write a concurrency test that can pass by accident because the thread
  timing happens to avoid the race on a given run — use latches
  (`CountDownLatch`) to force genuine contention at a known instant, as in the
  example above, rather than hoping threads interleave badly.
