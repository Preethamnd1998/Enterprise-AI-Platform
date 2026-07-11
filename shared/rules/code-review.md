# Code Review Rules
<!-- shared/rules/code-review.md — v4.1 -->
<!-- Lazy-loaded when producing a code review, analysis, or before declaring Gate A PASS. -->
<!-- Linked from contract §5 (lazy rules loading). Never inlined. -->

## CR-01 — Completeness before review
Before reviewing any change, confirm the full change set is in scope (all changed files,
all layers). A partial review is worse than no review — it creates false confidence.

## CR-02 — Layer coverage
For every change, verify ALL applicable layers are present and correct:
Controller · Service · Repository · DTO · Mapper · Entity · Enum · Constants ·
Validator · SQL · Flyway · Angular Component · UI Service · Model · Route ·
Flutter Widget · State Management (Bloc/Cubit/Provider) · Mobile Route ·
Permission · Translation · Audit logic · Tests.
A missing layer is a Gate A failure.

## CR-03 — No silent scope creep
If a review reveals scope beyond the original change set (a fix that also requires updating
a related service, a permission change that affects multiple controllers, etc.), STOP.
Document the additional scope and request approval before expanding work.

## CR-04 — Regression evidence required
For every Gate B claim, cite the specific existing behavior being preserved.
"No regression" is not a conclusion — it is a checklist result. Each item on the regression
checklist must be explicitly verified, not assumed.

## CR-05 — Security red flags
Flag for human review any change that touches:
- Authentication / authorization code
- Session or token handling
- Data access controls
- Flyway migrations on sensitive tables
- External-facing API signatures
Do not approve or proceed on these items without explicit human sign-off.

## CR-06 — Test review
For every new or modified test:
- Verify it actually tests the changed code path (not a trivially-passing assertion)
- Verify it would fail if the implementation were wrong
- Verify it does not use production data or external services without isolation

## CR-07 — Prompt quality assessment
After every command, append the §13 Execution Summary including `Prompt Quality` score.
The score is informational only — never used to block execution. Low scores indicate
that better input (Redmine IDs, stack traces, exact scope) could reduce future token cost.

## CR-08 — No invented data
Never invent test data, mock return values, or example values that resemble real PII
(real names, real IDs, real addresses, real credentials). Use clearly synthetic data:
`test@example.com`, `firstName: "Test"`, `id: 999999`.
