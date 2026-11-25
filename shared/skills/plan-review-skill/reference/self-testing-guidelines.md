# Self-Testing Guidelines (for developing engineers and AI agents)

Applies to whoever implements the plan, human or AI agent. The reviewer checks that the plan
**commits to** these and, after implementation, that the **evidence block** exists. Detailed
how-to lives in `shared/standards/testing/` (start at `README.md`; machine rules in
`shared/standards/testing.md`). This file is the definition-of-done checklist, not a copy.

## Ground rules

1. **Bug fix = red then green.** Write or extend a test that fails on the current code for the
   reported reason, then fix, then show it passes. Revert the fix once (or stash it) to prove
   the test can fail. A test that cannot fail is not evidence.
2. **Run it, don't assume it.** Never claim "tests pass" without the command and its result.
   If a tool cannot run (no Docker, no browser, no network), say so; the item is UNVERIFIED,
   never "passed".
3. **Never weaken tests to pass.** No deleting assertions, no `xit`/`fit`/`fdescribe`/
   `@Disabled`/`.only` left behind, no broadened mocks that hide the defect. Temporary
   exploratory tests follow `testing/test-lifecycle-and-build-isolation.md` and are removed or
   excluded before commit.
4. **Check the target service's own tooling first.** Testcontainers, Awaitility, ArchUnit and
   JaCoCo exist only in some services' `pom.xml`; confirm before using, propose adding rather
   than assuming.
5. **Test through the changed seam**, at the lowest level that proves the behaviour; add a
   higher-level test only for what lower levels cannot show (wiring, serialization, auth).
6. **Do not paste patient data** into tests, fixtures or evidence. Use synthetic data.
7. **Run on every branch the plan targets** (development, V2-QA, others per the plan's branch
   matrix) or state which you could not.

## UI: Angular (Jasmine + Karma)

| Check | What to do |
|---|---|
| Unit/component spec for each changed component, service, pipe, util | `*.spec.ts` beside the file; TestBed with real template where behaviour is in the template; spies for services (`jasmine.createSpyObj`) |
| Cover the bug | Spec reproduces the reported state (e.g. editor content `<p><br></p>` for an empty-note bug; a callback arriving after the dialog closed) |
| Async | `fakeAsync` + `tick`/`flush`, or `waitForAsync`; assert after change detection (`fixture.detectChanges()`); for components that update state in `ApiCallBack`-style callbacks, call the callback then assert the DOM |
| Negative twin | Same screen with the input that must stay blocked (disabled button, validation toast, no HTTP call: `expect(spy).not.toHaveBeenCalled()`) |
| Shared util | Direct tests of the util with edge inputs (null, empty, whitespace, HTML-only, image-only) |
| Run | `ng test --watch=false --browsers=ChromeHeadless` for the touched project (`--include=<path>` to scope; check `angular.json`/`karma.conf.js` for the project name); full project run before PR |
| Build | **Production** build of the host app (`ng build --configuration production`) and exercise the changed flow in that build; dev-only checks and minification hide or create bugs |
| Static | Type-check/lint clean (no new warnings); no `any` added to dodge errors |
| Consumers | Run specs of other apps/modules that consume the shared file (submodule pointer bump) or list them as not run |
| Playwright E2E | Only where the plan lists a user journey and the project has Playwright (`testing/playwright-e2e.md`); credentials parameterised, never in source |

## Backend: Java / Spring (JUnit 5 + Mockito)

| Check | What to do |
|---|---|
| Unit test per changed service/util/mapper | JUnit 5, `@ExtendWith(MockitoExtension.class)`, `@Mock`/`@InjectMocks`; `ArgumentCaptor` when the content passed matters; `verify(..., never())` for the negative path (`testing/java-junit-mockito.md`) |
| Cover the bug | Test the exact input/state from the RCA; assert outcome **and** side effects (saved entity fields, events published, audit) |
| Boundaries | null/empty/blank, max length, enum edge, date/timezone edge, 0/1/many, duplicate submit |
| API tests | `@WebMvcTest`/MockMvc for status codes, validation, auth/permission, error body, serialization; full-context test only when wiring matters (aspects, security) (`testing/java-api-testing.md`) |
| Black-box API check | Call the changed endpoint on the local or Canary stack (curl/Postman/Newman or HTTP client); record request, status, key response fields; run the negative and unauthorised cases |
| Repository/DB | `@DataJpaTest` or Testcontainers-backed tests for non-trivial queries; Mongo: test queries and ObjectId/string id matching (`testing/java-db-testing.md`); verify generated query or counts, not only that it runs |
| Migrations (Flyway) | HIGH risk: apply on a clean schema and on a copy with existing rows; check idempotence/rollback note; human gate per contract §9 |
| Messaging (Kafka) | Producer/consumer test with the service's tooling (EmbeddedKafka or Testcontainers if present); assert payload, topic, key, idempotent re-delivery |
| Concurrency/async | Awaitility for polling; test the race the plan identified |
| Run | `mvn test` (unit) for the module; `mvn verify` where integration tests run under failsafe (needs Docker); report both counts |
| Coverage | Changed lines covered (JaCoCo where configured); list uncovered changed lines and why |
| Performance | For list/query/batch changes: row counts, query plan or timing against realistic volume (`testing/java-performance-load-testing.md`) |

## Both: regression and evidence

- Re-run the existing tests of every consumer on the plan's blast-radius matrix (or the agreed
  sample); record any failure you did not cause and any you fixed.
- Manual self-test script: the plan's P0/P1 cases executed by hand on the relevant environment
  (with the production-optimised UI build), including the negative twin and logout/navigation
  checks around the changed screen.
- Evidence block in the MR/Redmine comment (format below). No block, no "done".

```text
Self-Test Evidence
Branch/commit: <repo@branch:sha>   Env: <local|canary|v2qa|...>   Build: <dev|prod>
Red→Green: <test id> failed before fix (<reason>), passes after. Reverted-fix check: yes/no
UI:  ng test <scope>  → <N> passed / <N> failed / <N> skipped   (command + date)
BE:  mvn test -pl <module> → <N>/<N>;  mvn verify → <N>/<N> or NOT RUN (<why>)
API: <METHOD path> → <status> (happy), <status> (negative), <status> (unauthorised)
DB/Kafka: <check and counts only, no PHI>
Regression: <consumers/areas run> → <result>
Coverage of changed lines: <%> (uncovered: <file:line ranges + reason>)
Not run / UNVERIFIED: <list>
```

## What the reviewer checks

Plan states each applicable row above with the concrete test files to add (path and test
names); bug-fix plans name the failing-first test; the evidence block matches the code diff
(test files in the change set), and counts are plausible for the commands named.
