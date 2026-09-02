# /test â€” Test Coverage Analysis & Scaffold

**Version:** 4.0  
**Standards:** `shared/standards/testing.md` (authoritative for all rules in this command)  
**Platforms:** Claude Code, GitHub Copilot, OpenCode  

---

## Purpose

Analyse test coverage for a change set, produce a gap report, and scaffold missing tests.

**Read-only phase first.** No test files are written until the user approves.

---

## Invocation

```text
/test                                      Session Mode â€” describe tasks one by one
/test redmine=42391                        Direct â€” analyze changed files in Redmine issue
/test mr=!247                              Direct â€” changed files in MR
/test commit=abc1234                       Direct â€” changed files in commit
/test file=path/to/Service.java            Direct â€” named file
/test auto=true                            Skip approval gate (not recommended for test scaffolding)
/test agents=2                             Enable 2 subagents for parallel analysis
/test mode=integration                     Include integration tests in scope
/test mode=e2e                             Include E2E tests in scope
```

---

## Argument Parsing

| Key | Values | Effect |
|---|---|---|
| `redmine` | Issue ID | Resolve changed files from Redmine issue + linked MR |
| `mr` | `!N` | Resolve changed files from GitLab MR diff |
| `commit` | SHA | Resolve changed files from commit diff |
| `file` | path | Analyze named file only |
| `auto` | true | Skip approval gate |
| `agents` | 1â€“3 | Opt-in subagents (default: 0, hard cap: 3) |
| `mode` | unit / integration / e2e | Scope (default: unit) |

---

## Execution Algorithm

### Phase 1 â€” Stack Detection (read-only)

1. Detect test stack per `shared/standards/testing.md Â§1`.
   - Search for `pom.xml`, `build.gradle`, `angular.json`, `package.json` with test config.
   - Multiple stacks = multiple detection results.
   - No match = emit `STACK_UNKNOWN` and stop.

2. Identify test runner and coverage tool:
   - Java: `mvn test` + JaCoCo (if configured in pom.xml)
   - Angular: `ng test` + Istanbul/Karma coverage
   - Node: `npm test` + Jest coverage

### Phase 2 â€” Change Set Resolution

Resolve the set of changed files from the input (MR diff, commit, named file).
Apply `shared/contract.md` discovery rules: no scan, depth-1 only.

For each changed file:
- Identify the corresponding test file by naming convention (`shared/standards/testing.md Â§4`)
- Classify: has test / missing test / test exists but disabled

### Phase 3 â€” Subagent dispatch (only if `agents=N` specified)

Spawn at most N (â‰¤ 3) subagents for parallel gap analysis across independent modules.
Each subagent: read-only, receives one module's changed files, returns gap list.
Subagents governed by `shared/standards/testing.md Â§2`.

Do NOT spawn subagents for single-file or single-module inputs.

### Phase 4 â€” Gap Report + Gate Check

Produce gap report per `shared/standards/testing.md Â§3`.
Run Gate A (completeness) and Gate B (regression) per `shared/standards/testing.md Â§5`.

### Phase 5 â€” Output (per output contract Â§6)

Emit all 7 sections defined in `shared/standards/testing.md Â§6`.
Stop at section 7 (APPROVAL GATE) unless `auto=true`.

### Phase 6 â€” Implementation (post-approval only)

For each gap identified:
1. Create the test file at the conventional path.
2. Write test class scaffold:
   - Java: `@ExtendWith(MockitoExtension.class)`, `@Test` stubs for each public method
   - Angular: `TestBed.configureTestingModule(...)`, `it('should ...')` stubs
   - Node: `describe(...)`, `it(...)` stubs
3. Do NOT run the tests (analysis only). State the command to run.
4. Do NOT modify production code.

---

## Constraints (from standards/testing.md Â§7)

- Never run tests autonomously
- Never delete existing tests
- Never modify production code
- Never generate mocks for external services without noting the mock boundary
- Generated code (`*Generated.java`, `*.g.ts`) excluded from gap analysis

---

## Token Budget

| Task | Max files | Token budget |
|---|---|---|
| Single-file test scaffold | 5 | â‰¤ 6k |
| MR gap report (no scaffold) | 15 | â‰¤ 8k |
| Full MR scaffold | 20 | â‰¤ 12k |

---

## Output Examples

### Example A â€” Java gap detected

```
STACK DETECTED
  Java / Spring Boot | JUnit 5 | pom.xml
  Maven test runner: mvn test -pl <module>

CHANGED FILES (3)
  src/main/java/com/example/OrderService.java
  src/main/java/com/example/OrderRepository.java
  src/main/java/com/example/dto/OrderDto.java

EXISTING TESTS (1)
  src/test/java/com/example/OrderServiceTest.java â†’ covers OrderService.java

COVERAGE GAP REPORT
  Files changed:    3
  Files with tests: 1
  Missing tests:
    - OrderRepository.java â†’ no test found (expected: OrderRepositoryTest.java or OrderRepositoryIT.java)
    - OrderDto.java        â†’ DTO, no test required (excluded by convention)

  Warning: 1 changed file has no test coverage.

GATE A: PASS  GATE B: PASS

IMPLEMENTATION PLAN
  New file: src/test/java/com/example/OrderRepositoryIT.java
    - @DataJpaTest scaffold
    - test: findByOrderId_returnsOrder()
    - test: save_persistsOrder()

APPROVAL GATE
  Proceed with implementation? [yes/no/modify]
```

### Example B â€” Angular gap detected

```
STACK DETECTED
  Angular 17 | Karma + Jasmine | angular.json

CHANGED FILES (2)
  src/app/ward/ward.component.ts  [SKIPPED â€” .component.ts is never modified per contract]
  src/app/ward/ward.service.ts

EXISTING TESTS (0)
  none found

COVERAGE GAP REPORT
  Files changed:    1 (ward.service.ts â€” .component.ts excluded)
  Files with tests: 0
  Missing tests:
    - ward.service.ts â†’ no test found (expected: ward.service.spec.ts)

GATE A: PASS  GATE B: PASS

IMPLEMENTATION PLAN
  New file: src/app/ward/ward.service.spec.ts
    - TestBed.configureTestingModule with WardService
    - it('should be created') stub
    - it('should call ...') stub per public method

APPROVAL GATE
  Proceed with implementation? [yes/no/modify]
```

