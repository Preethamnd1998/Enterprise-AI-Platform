# JUnit 5 + Mockito — Unit & Service-Layer Testing

**Verified stack:** JUnit 5 + Mockito ship via `spring-boot-starter-test` (test
scope) in every service's `pom.xml` — no extra dependency needed for what's in this
file. Confirmed real usage pattern: `core-service`'s
`PatientMergeServiceRollbackTest`, `PatientMergeServiceKillSwitchTest`,
`ValidationEngineImplTest`, etc.

## Unit testing — a class in isolation

Use `@ExtendWith(MockitoExtension.class)` (not `@RunWith`, which is JUnit 4) with
`@Mock` for collaborators and `@InjectMocks` for the class under test — this is the
established pattern in this codebase:

```java
@ExtendWith(MockitoExtension.class)
class PatientMergeServiceRollbackTest {

    @Mock
    private PatientMergeEventRepository mergeEventRepository;

    @Mock
    private PatientMergeMetrics metrics;

    @InjectMocks
    private PatientMergeService patientMergeService;

    @Test
    void initiateAutoRollback_alreadyRollingBack_isNoOp() {
        // arrange
        PatientMergeEvent event = eventWithStatus(MergeStatus.ROLLING_BACK);
        when(mergeEventRepository.findById(MERGE_ID)).thenReturn(Optional.of(event));

        // act
        patientMergeService.initiateAutoRollback(MERGE_ID);

        // assert
        verify(mergeEventRepository, never()).save(any());
    }
}
```

**Naming convention (already in use — keep it):**
`methodUnderTest_condition_expectedResult`.

### When to use `@Mock` vs a real object

- **Mock**: repositories, Feign clients to other services, anything with I/O,
  anything whose *own* correctness isn't what this test is verifying.
- **Real object**: DTOs, value objects (`CustomerTransactionAttribute`), entities,
  simple utility classes with no external dependency — construct them directly,
  don't mock them. Mocking a plain data holder just adds noise and hides real bugs
  (e.g., a mocked getter returning a stubbed value hides an actual mapping bug).

### `ArgumentCaptor` — verifying what was passed, not just that something was

```java
@Test
void persistTerminalStateIsolated_onRollbackFailure_setsFailedUnrecoverable() {
    ArgumentCaptor<PatientMergeEvent> captor = ArgumentCaptor.forClass(PatientMergeEvent.class);

    patientMergeService.persistTerminalStateIsolated(MERGE_ID, someFailure);

    verify(mergeEventRepository).save(captor.capture());
    assertThat(captor.getValue().getStatus()).isEqualTo(MergeStatus.FAILED_UNRECOVERABLE);
}
```

Use this whenever the *content* of what's saved/sent matters — `verify(...).save(any())`
alone only proves a save happened, not that it saved the right thing.

### Self-injection / proxy mocking (`@Mock private X self;`)

`PatientMergeServiceRollbackTest` mocks the service's own self-reference
(`@Mock private PatientMergeService self;`) — this pattern appears when a class
calls its own `@Transactional(propagation = REQUIRES_NEW)` method through a
self-injected Spring proxy (needed because Spring AOP proxies don't intercept
internal `this.method()` calls). When you see a `self` field, it's testing that
the isolated-transaction call was actually routed through the proxy, not called
directly — verify with `verify(self).theIsolatedMethod(...)`.

## Service/business-logic testing — mocked collaborators, real orchestration logic

Use when testing how a service *coordinates* calls (order, conditionals, error
handling) rather than what a single method computes.

```java
@Test
void compareAndMerge_activeEncounterOnLosingRecord_rejectsWithConflict() {
    when(encounterRepository.hasActiveEncounter(losingPatientId)).thenReturn(true);

    assertThatThrownBy(() -> patientMergeService.compareAndMerge(winningId, losingPatientId))
        .isInstanceOf(MergeConflictException.class)
        .hasMessageContaining("active encounter");

    verify(mergeEventRepository, never()).save(any());
}
```

**Decision rule:** if the test needs 4+ mocks stubbed just to reach the code path
under test, that's a signal the method is doing too much — consider whether the
orchestration logic should be extracted, rather than writing an increasingly
elaborate mock setup.

## Assertions — prefer AssertJ (bundled with `spring-boot-starter-test`)

```java
assertThat(result.getSiteId()).isEqualTo(expectedSiteId);
assertThat(result.getItems()).hasSize(3).extracting("status").containsOnly(ACTIVE);
assertThatThrownBy(() -> service.doThing(badInput))
    .isInstanceOf(ValidationException.class);
```

Prefer AssertJ's fluent style over raw `assertEquals`/`assertTrue` for anything
beyond a single scalar comparison — the failure messages are far more useful for
collections and object graphs.

## Parameterized tests — for equivalence-partition/BVA sweeps

```java
@ParameterizedTest
@ValueSource(longs = {-1L, 0L})
void withSiteId_nonPositive_throwsValidation(long invalidSiteId) {
    assertThatThrownBy(() -> cta.withSiteId(invalidSiteId))
        .isInstanceOf(IllegalArgumentException.class);
}

@ParameterizedTest
@CsvSource({
    "IN_PROGRESS, false, false, true",   // proceeds
    "IN_PROGRESS, true,  false, false",  // active encounter blocks
    "COMPLETED,   false, false, false",  // already terminal
})
void isEligibleForMerge_decisionTable(MergeStatus status, boolean hasActiveEncounter,
                                       boolean rollingBack, boolean expected) {
    assertThat(eligibilityChecker.isEligible(status, hasActiveEncounter, rollingBack))
        .isEqualTo(expected);
}
```

Use `@CsvSource`/`@MethodSource` directly for the decision-table cases from
[test-case-design.md](test-case-design.md) — one parameterized test replaces N
near-identical `@Test` methods.

## Common mistakes to avoid

- **Over-stubbing:** stubbing a method the test path never calls
  (`UnnecessaryStubbingException` under strict stubs, which `MockitoExtension`
  enables by default) — remove unused `when(...)` calls rather than suppressing
  the warning.
- **Verifying too little:** `verify(repo).save(any())` when the test's whole point
  was to check *what* got saved — use `ArgumentCaptor`.
- **Testing the mock, not the code:** if a test only asserts that a stubbed value
  comes back unchanged, it's testing Mockito, not your logic.
- **`@Mock` on the class under test:** never mock the thing you're testing —
  `@InjectMocks` (or manual constructor injection) only.
