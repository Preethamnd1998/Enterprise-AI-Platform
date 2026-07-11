# Testing Standards
**Status:** Phase C active (v4.0)  
**Updated:** 2026-07-07 (TK-077 — expanded from Sprint 1 stub)  
**Referenced by:** Contract kernel §C4 (subagent limits); `/test` command  

---

## §1 — Stack Detection

The `/test` command detects the test stack automatically from project files. No configuration required.

### Detection priority (first match wins)

| Signal file | Detected stack | Test runner |
|---|---|---|
| `pom.xml` (root or `*/pom.xml`) | Java / Spring Boot | JUnit 5 (`mvn test`) |
| `build.gradle` or `build.gradle.kts` | Java / Gradle | JUnit 5 (`gradle test`) |
| `angular.json` | Angular + TypeScript | Karma + Jasmine (`ng test`) |
| `package.json` + `jest.config.*` | Node.js / React | Jest (`npm test`) |
| `package.json` + `vitest.config.*` | Vite / Vue | Vitest (`npm run test`) |
| `package.json` alone | Node.js generic | npm test |
| `pubspec.yaml` | Flutter / Dart | `flutter test` |
| `playwright.config.*` | E2E | Playwright (optional — Playwright plugin soft dep, BUG-D3) |
| `cypress.config.*` | E2E | Cypress (optional) |

**Multiple stacks:** If `pom.xml`/`angular.json`/`pubspec.yaml` co-exist (e.g. a Spring Boot
backend, an Angular web app, and a Flutter mobile app), run all detected stacks.
Report as separate gap sections in the output, one per stack.

**No match:** Emit `STACK_UNKNOWN` in the output contract. Do not guess or scan.

---

## §2 — Subagent Limits (active — governs all subagent use platform-wide)

**Default:** 0 subagents. No subagents are spawned unless explicitly opted in.

**Opt-in:** Include `agents=N` (where N = 1, 2, or 3) in the task prompt.

**Hard cap:** Never more than 3 subagents per task invocation, regardless of N.

**Allowed uses (read-only only):**
- Parallel analysis of independent test modules in separate stack layers
- Parallel red-team verification of a proposed test scaffold
- Parallel coverage gap identification across service boundaries

**Prohibited:**
- Agent chains (output of agent A fed as instructions to agent B)
- Agents spawning their own subagents
- More than 3 concurrent agents
- Subagents writing tests, running commands, or touching the filesystem
- Using agents to bypass the single-reasoning-agent rule in the contract kernel

**Validation:** If `agents=N` and N > 3, silently cap at 3 and add a WARNING line to the output.

---

## §3 — Coverage Policy

### Phase C behavior (warn mode)

- Coverage gate is in **warn** mode: low coverage emits a warning in the output; it does NOT block the task.
- Warn threshold: any test class with **0% coverage** for a changed file triggers the warning.
- Do NOT enforce a numeric threshold in Phase C.

### Phase D+ behavior (enforce mode — not yet active)

Will be enabled when usage data confirms coverage tooling is stable. Threshold will be defined in consuming repo `.ai-platform/coverage.yml` (see §6).

### Coverage gap report format

```
COVERAGE GAP REPORT
===================
Files changed:   <N>
Files with tests: <M>
Files missing tests (0% coverage): <list>

Warning: <K> changed files have no test coverage.
         Add tests or add to .ai-platform/coverage.yml allow-list.
```

---

## §4 — Test File Naming Conventions

| Stack | Unit test | Integration test | E2E test |
|---|---|---|---|
| Java | `*Test.java` | `*IT.java` | `*E2ETest.java` |
| Angular/TS | `*.spec.ts` | `*.integration.spec.ts` | `*.e2e-spec.ts` |
| Node/Jest | `*.test.js` / `*.test.ts` | `*.integration.test.ts` | `*.e2e.test.ts` |
| Flutter/Dart | `*_test.dart` (`test/`) | `*_test.dart` (`integration_test/`) | `*_test.dart` (`integration_test/`, driven by `patrol`/`integration_test` package) |

**/test command scope by default:**
- Unit tests only: `*Test.java`, `*.spec.ts`, `*.test.*`, `*_test.dart` (under `test/`)
- Integration tests: only when `mode=integration` or `agents=2` specified
- E2E: only when `mode=e2e` specified (Playwright/Cypress, or Flutter `integration_test/`, must be installed)

---

## §5 — Two-Gate Validation (required for every /test output)

Gate A — **Completeness:**
- [ ] All changed files have at least one test referenced or identified as gap
- [ ] Stack was detected (not STACK_UNKNOWN, or STACK_UNKNOWN is explained)
- [ ] Coverage gap report section present

Gate B — **Regression:**
- [ ] No existing test file is modified by the AI unless the user explicitly approved it
- [ ] No test is deleted
- [ ] Test framework configuration files (`pom.xml`, `angular.json`, `jest.config.*`) are read-only

Both gates must PASS before the output section "IMPLEMENTATION PLAN" is shown.

---

## §6 — Output Contract

Every `/test` invocation must produce exactly these sections in order:

```
1. STACK DETECTED
   <runner> | <version if detectable> | <config file>

2. CHANGED FILES
   <list of files changed since last commit, or from input>

3. EXISTING TESTS
   <list of test files covering changed files, or "none found">

4. COVERAGE GAP REPORT
   <per §3>

5. GATE A: <PASS|FAIL>  GATE B: <PASS|FAIL>

6. IMPLEMENTATION PLAN (only if both gates pass)
   <new test file paths to create, one per changed file without coverage>
   <test case names for each>

7. APPROVAL GATE
   "Proceed with implementation? [yes/no/modify]"
   (skipped if auto=true)
```

**Never skip sections.** If a section has nothing to report, write "none" or "N/A".

---

## §7 — Banned Patterns

The `/test` command must NEVER:

- Run tests (`mvn test`, `ng test`, `npm test`) — analysis only; running tests requires user confirmation
- Modify production code (only test files and test configuration)
- Add dependencies to `pom.xml`, `package.json`, or `build.gradle` without explicit approval
- Create test data that contains real PII, credentials, or production data
- Delete existing tests
- Modify `@SpringBootApplication`, `main()`, or application bootstrap code
- Generate mocks for external services (MQ, DB, APIs) without noting the mock boundary

---

## §8 — Edge-Case Taxonomy

| Edge case | Behavior |
|---|---|
| Monorepo (multiple pom.xml / angular.json / pubspec.yaml) | Detect all; report separately per module |
| Test file exists but covers different class | Treat as gap; note the mismatch |
| Coverage tool not installed | Emit `COVERAGE_TOOL_UNAVAILABLE`; proceed without coverage numbers |
| Test class already has 80%+ coverage | Note "well covered"; suggest no new tests needed |
| Changed file is a test file itself | Skip gap analysis for it; include in "existing tests" list |
| Generated code (`*Generated.java`, `*.g.ts`, `*.g.dart`, `*.freezed.dart`) | Exclude from gap analysis; note exclusion |
| `@Ignore` / `xit()` / `xdescribe()` / `skip: true` disabled tests | Flag as "test exists but disabled" — not counted as coverage |
