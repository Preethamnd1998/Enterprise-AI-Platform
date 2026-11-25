---
name: fix-plan
description: Plan the fix for a Redmine ticket (bug, QA-failed retest, regression) as an evidence-backed Fix Plan that is review-gated before anything is built or posted — root cause with data, every care setting and branch in scope, a behaviour table, guards, verification, a QA retest script and what is deliberately not covered. Use when asked to plan, RCA or write up the approach for a ticket, when QA reopens one, or before posting a plan to Redmine.
---

# Fix Plan

A plan is done when a stranger can build it, QA can retest it, and a reviewer can find nothing to
send back. The shape comes from the strongest plans on the tracker (#42242, rounds 1-3: one RCA per QA
failure, proved on real data, scoped to every care setting and branch, with a retest script).

Write the plan where the repo keeps its triage notes (in lths-mgmt: `workspace/triage/<issue-id>-<slug>.md`,
or the existing triage note; elsewhere `<issue-id>-<slug>.md` beside the ticket's other notes). Draft the
Redmine comment next to it; **post only when asked**. No patient data, credentials or connection
strings anywhere: refer to clinical data by shape and count.

**Precedence.** This is the lths-mgmt planning method, generalised. Where it conflicts with the
platform's review rubric or other generic guidance, the rules in this skill win (for example: a
correction ships live with no toggle, the plan layout in PLAN-TEMPLATE.md, Block/Fix/Note labels, the
approval stop for High/Critical risk). Where it is silent, follow `plan-review-skill`.

## Steps

1. **Read the whole ticket.** Every journal, newest QA report first. List each QA failure round and what
   each claimed. Two reports in one round are usually **two defects**: split them.
2. **Check what already shipped.** Search every target branch (development, V2-QA, the customer QA
   branch) for the fix under *any* ticket before planning. A one-line fix can already be on one branch.
3. **Reproduce on data.** Read-only queries against the environment QA used. Label each fact with
   datasource and date. Show the rows' shape (ids abbreviated, states, timestamps), not personal data.
4. **Root cause, not symptom.** Name the mechanism, `path:line`, and **why it worked before and fails
   now** (the ticket or commit that changed it, and its date). Separate this round's defect from any
   defect already closed. Mark each statement **verified** or **suspected**.
5. **Size it.** Query the whole population, not the QA sample (for example "38 of 38 resolvable pairs,
   all care settings"). Cover every care setting (IP, OP, ER, Day Care), the mirrored path, both ends of
   any cross-service flow, and every repo and UI module involved. Is the repo set complete?
6. **Design the fix** as a behaviour table (state → outcome), with guards and a fallback for every
   guard. Enforce rules on the **server**, not only in the UI. A correction ships live, no toggle; if it
   changes a contract, receivers accept old and new forms. Record alternatives you rejected and why.
7. **Plan the verification** at the agreed seam: new tests (names and case counts), including negative
   and old-form inputs; compile on every branch; full suite compared with a baseline from the same
   commit. Say plainly what was **not** run (for example "not tested in a browser").
8. **Branch and deploy matrix.** One row per target branch with its MR for each repo; deploy order and
   whether either side is inert without the other.
9. **Write the QA retest script** per care setting: numbered steps, expected result each, including the
   already-reached-the-stop-point case and an unchanged-behaviour regression pass.
10. **State what is not covered** and what stays broken (earlier bad data, adjacent defects), each with
    an owner or a follow-up.
11. **Review gate.** Run [REVIEW-GATE.md](REVIEW-GATE.md) against the plan, then **score it with the
    `plan-review-skill`** (plugin skill `enterprise-ai-platform:plan-review-skill`: 100-point rubric,
    hard caps, rules PR-01..PR-27). Fix every Block item and every gap, re-score, and record the score
    history in the plan (round 1 → round 2 …, max 3). Target 90+. A High/Critical risk (DB or Flyway,
    permissions, auth, billing, patient data) stops for the user's approval before build regardless of
    score.
12. **Capability update.** If the repo has a `capability-map` skill and you learned what the application
    does, update the Capability Map and tag the ticket.

## Works with the review skill

This skill **writes** the plan; `plan-review-skill` **reviews** it (checks evidence on every branch,
analyses gaps, scores, and can return a better plan with the old score kept beside the new). Build the
plan so it already satisfies what the reviewer checks:

- **Change Map with line numbers** (bug fixes): every edit as repo@branch(sha), file, line range, symbol,
  change, why, symptom fixed, read from each branch with `git show <ref>:<path>`, one row per branch
  where lines differ. No fetch without asking.
- **Blast radius**: consumers, per-app copies, submodules and sibling apps with the same defect, API/DB/
  Kafka/permissions/print/audit, release path and rebuild list, rollback; regression matrix.
- **Self-testing plan** for whoever builds it, human or AI agent: failing-first test, UI Jasmine+Karma
  (`ng test`) and a production-build run, BE JUnit 5 + Mockito (`mvn test`/`mvn verify`), API tests and a
  black-box call, DB/Kafka checks, consumer regression, and a Self-Test Evidence block after the build
  (`plan-review-skill` → `reference/self-testing-guidelines.md`).
- **Test cases of all kinds** (`reference/test-case-taxonomy.md`), not only the happy path.
- Ajith's way stays the spine: one RCA per QA round, proved on real data, why it worked before, behaviour
  table with guards, one MR per branch per repo, baseline-compared verification, retest script, not-covered.

**Reviewing someone else's plan** (a junior's, or an earlier round): do not rewrite from scratch. Run
`plan-review-skill`; keep its old score; take its gap analysis and revised plan, rebuild the result in
[PLAN-TEMPLATE.md](PLAN-TEMPLATE.md) shape, and show old vs revised (projected) score.

The section layout is in [PLAN-TEMPLATE.md](PLAN-TEMPLATE.md). Put anything durable (an invariant, a
defect family) in the repo's knowledge notes (in lths-mgmt: `workspace/knowledge/`).

## After the build

Run the same gate's **Diff** section on each MR before it is called ready: Spec and Standards read
separately, by someone who did not write the code.
