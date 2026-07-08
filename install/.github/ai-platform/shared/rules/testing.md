# Testing Rules
<!-- shared/rules/testing.md — v4.1 -->
<!-- Lazy-loaded when a change includes new or modified code. Complements standards/testing.md. -->
<!-- Linked from contract §5 (lazy rules loading). Never inlined. -->

## TR-01 — Never delete existing tests
Existing tests must not be removed, commented out, or disabled without a documented reason
and explicit human approval. If a test is genuinely obsolete, mark it @Disabled / xdescribe
with a comment explaining why, and flag it in the gap report.

## TR-02 — Never run tests
The platform AI must not execute test commands (`mvn test`, `ng test`, `jest`, etc.).
Test output is provided by humans or CI. The AI only reads existing test files and writes
new ones. See `standards/testing.md §7` (banned patterns).

## TR-03 — Two-gate test coverage
Before reporting "done", both gates must pass:
- **Gate A:** every changed file has a corresponding test file (existing or new). If no test
  exists and one is not being added, the gap must be explicitly noted in the gap report.
- **Gate B:** no existing tests have been deleted or disabled (unless approved).

## TR-04 — Test isolation
Unit tests must not depend on external services, databases, or network calls.
Integration tests (*.IT.java, *.integration.spec.ts) may use real infrastructure but must
use isolated test data that does not affect production or shared environments.

## TR-05 — Stack-appropriate test framework
Use the project's detected test framework (see `standards/testing.md §1`):
- Java: JUnit 5 + Mockito. Never introduce TestNG unless the project already uses it.
- Angular: Jasmine + Karma. Never introduce Jest unless the project already uses it.
- Node: Jest. Never introduce Mocha unless the project already uses it.

## TR-06 — Coverage phase policy
In **Phase C** (current): coverage gate is in warn mode. A 0% coverage file emits a warning
but does not block. In **Phase D+**: coverage enforcement will be enabled.
Thresholds are set in `.ai-platform/coverage.yml`. Do not raise thresholds without
establishing a coverage baseline first.

## TR-07 — No production-code modification for testability
Do not modify production source files solely to make them easier to test (e.g. adding
package-private accessors, removing final modifiers). Use established testing patterns:
mocks, test constructors, or established factory methods.

## TR-08 — Generated code exclusion
Files matching `AI_PATTERNS.md` generated-code patterns (MapStruct mappers, *.g.ts, etc.)
are excluded from the coverage gap report. Do not write tests for generated code.
