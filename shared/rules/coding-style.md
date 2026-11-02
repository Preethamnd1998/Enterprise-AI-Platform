# Coding Style Rules
<!-- shared/rules/coding-style.md — v4.2 -->
<!-- Lazy-loaded when the change set includes production code. Complements standards/. -->
<!-- Linked from contract §5 (lazy rules loading). Never inlined. -->

## CS-01 — Follow established patterns first
Before suggesting a new pattern, check `AI_PATTERNS.md`. If a pattern for this use case
already exists in the codebase, use it. Introducing an alternative pattern requires
explicit justification and human approval.

## CS-02 — Naming conventions
Follow the project's naming conventions documented in `AI_PATTERNS.md`.
If not documented: use the naming convention already present in the same file or package.
Never mix conventions (camelCase + snake_case in the same class, for example).

## CS-03 — No magic numbers or strings
Extract magic literals (numbers, status codes, string keys) as named constants.
Use the project's existing constants class/enum if one exists. Create one if none exists,
following the project's naming convention.

## CS-04 — Method length
Methods should do one thing. If a method exceeds ~30 lines, consider whether it can be
decomposed — but only if decomposition is consistent with the existing codebase style.
Do not refactor for style alone unless the task specifically requires it.

## CS-05 — No commented-out code
Do not leave commented-out code in a change. Dead code should be deleted, not commented.
If a block may be needed for rollback, document the rollback approach in the PR description
instead.

## CS-06 — Minimize diff size
Only change what the task requires. Do not reformat unrelated lines, reorganize imports
beyond what's needed, or adjust whitespace in unchanged methods. Large irrelevant diffs
make review harder and increase regression risk.

## CS-07 — Imports
Use the project's import style (wildcard vs explicit, static imports, etc.).
Remove unused imports. Do not add imports for classes that are not used in the change.

## CS-08 — Logging
Follow the project's logging pattern (see `AI_PATTERNS.md`).
Never log PII, credentials, tokens, or full request/response bodies.
Use appropriate log levels: DEBUG for diagnostic, INFO for operational events, WARN for
recoverable issues, ERROR for failures requiring attention.

## CS-09 — Comments
Write comments only when the WHY is non-obvious: a hidden constraint, a workaround for a
known bug, a subtle invariant, or behavior that would surprise a reader.
Do not write comments that restate what the code does. Do not write TODO comments unless
they are linked to a tracked issue (Redmine ID / ticket reference).

## CS-10 — Minimal-footprint implementation (decision ladder)
Before writing new code, work down this ladder and stop at the first rung that satisfies the
task — do not jump straight to custom code by default:
1. Can the task be skipped or descoped (YAGNI)? If the feature isn't actually needed yet, say so
   instead of building it speculatively.
2. Does the language/framework standard library already do this?
3. Does a dependency already present in the project do this?
4. Can an existing utility/service/component in this codebase be reused or extended (see CS-01)?
5. Only then: write the smallest new code that satisfies the task (see CS-06).
This never overrides security, validation, authorization, error handling, or test coverage
(`coding-standards.md` §13, `rules/security.md`) — those are never traded away for a smaller diff.
