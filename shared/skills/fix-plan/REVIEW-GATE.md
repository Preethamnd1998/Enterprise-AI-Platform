# Review gate

Two axes, read separately. Do the Spec pass, then the Standards pass; do not let one excuse the other.
Where you can, have someone who did not write the plan run it. Label each finding **Block** (must change
before build or merge), **Fix** (should change) or **Note**. Quote the ticket or standard line for each.

## Plan: Spec axis (does it do what was asked?)

- Every scenario and acceptance criterion in the ticket maps to a fix part and a test (Acceptance map
  has no empty cell). Missing or partial → Block.
- Every QA report in the latest round is answered; two defects are not merged into one.
- Nothing in the fix that no ticket line asked for. Work belonging to another ticket is listed, not done.
- "Looks done but wrong": re-read each behaviour-table row against the ticket sentence it claims to meet.
- The spec itself silent or wrong → mark **spec gap** and take it back to design; do not guess.
- Expected-behaviour statements in older journals are not contradicted by the plan.

## Plan: Evidence axis (is it proven?)

- Each root-cause claim is **verified** with data or code, or marked suspected. No hypothesis is a finding.
- The population query covers every care setting; the denominator and its unresolvable rows are stated.
- The "why it worked before" answer names a ticket or commit and date.
- No fix is built on the QA sample alone. Environment and date stated for every row.
- Code that already shipped on another branch was searched for first.

## Plan: Standards axis (does it follow the rules?)

- Correction: no feature toggle. Co-existing feature: toggle default OFF, both states tested.
- Contract change: old and new forms accepted; OpenAPI or contract test included where the repo has them.
- Money in the service's documented type; other services' data arrives by event, not cross-database read.
- No remote call or Kafka send inside a transaction. New topics declared in the service's topic constants.
- Migrations safe for a rolling deploy and existing rows; new queries covered by an index.
- Time uses the glossary terms (Instant in UTC, calendar date never shifted).
- UI: prefer a module over widening the shell or shared libraries; a needed module revision moves its pin.
- Dependency bumps: dependency tree shown for each added or bumped group; no same family twice.
- Tests: at least one full-context boot for a backend change; negative and old-form cases present.
- Branch plan follows the branching SOP: one feature branch, linear history, commit subject format.
- Every guard has a fallback; every rule is enforced on the server.

## Plan: Delivery axis (can QA and ops use it?)

- Branch and deploy matrix lists every repo and target branch, deploy order, and inert-without-the-other.
- The retest script has numbered steps with expected results per care setting, a stop-point case and a
  regression pass.
- "Not covered" is explicit and honest, including what was not run (browser, environment).
- Risk level set; High/Critical has user approval recorded.
- No patient data, credentials or connection strings in the plan or the draft comment.

## Plan: Score gate (plan-review-skill)

- Run the plugin skill `enterprise-ai-platform:plan-review-skill` on the plan: score from the 100-point
  rubric, apply hard caps, record the score and verdict in section 10 of the plan.
- Bug-fix plan has a Change Map whose lines were verified on each branch (PR-25); missing or wrong → Block.
- Self-testing plan present with failing-first test, UI Jasmine+Karma, BE JUnit 5 + Mockito, API tests,
  production-build run (PR-26); after the build, a Self-Test Evidence block exists (PR-27).
- Blast radius complete: consumers, copies, submodules, sibling apps, release path, rollback.
- Below 90: fix gaps, produce the revised plan, keep the old score beside the projected new one, re-score
  (max 3 rounds). High/Critical risk needs the user's approval whatever the score.

## Diff (run per MR after build)

Spec reviewer: missing or partial criteria, not-asked-for behaviour, looks-done-but-wrong, wrong seam.
Standards reviewer: the repo's own documented standards first, then the coding standards file, then the
smell baseline (judgement calls only). Plus the runtime-safety checks: dependency tree, startup scan if
a toggle was added, full-context load. Each report under 400 words, ends with counts and the worst item.
