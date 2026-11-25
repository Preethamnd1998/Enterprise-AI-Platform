---
name: plan-review-skill
description: Senior-reviewer method for plans written by junior engineers (PLAN.md, a Redmine-attached plan, inline text): verify requirement, RCA and code claims against real evidence on every relevant branch, map blast radius, check test cases of all kinds, then score 0-100 from a fixed rubric with hard caps. Load for any "review this plan / is this plan ready / score the plan" task, and from /plan-reviewer.
---

# Plan Review Skill

A plan is a claim set, not a deliverable. Score only what you verified. This skill is the
method; the `/plan-reviewer` command is the runner (it keeps its four headline scores and the
approval threshold; this skill supplies the rubric, rules, branch/blast-radius method and
test taxonomy behind them).

Read-only. Never post to Redmine, fetch, push or change code unless the user asks. Never copy
patient data into a review: counts, shapes and structures only.

## Workflow (do in order; open only the reference the step names)

1. **Intake**: resolve the plan, the ticket (description **and latest journals** — comments
   override the description), attachments (screenshots often hold the real error), linked MRs,
   and any BRD. Large `redmine_get_issue` dumps cost ~12k tokens: read once, summarise.
2. **Requirement trace** → `reference/rca-and-requirement.md` §1. Build the symptom →
   requirement → plan-item matrix. A reported symptom with no plan item is a finding.
3. **RCA check** → `reference/rca-and-requirement.md` §2. Is the cause proven, reproduced,
   alternatives ruled out?
4. **Code understanding and Change Map** → `reference/rca-and-requirement.md` §3-§4. Graph
   first (`unified-trace` / `knowledge-graph`), then `file:line` on the **target branch**, not
   the working tree. A **bug-fix plan must carry a line-level Change Map** (repo@branch, file,
   line range, symbol, change, why); verify every row with `git show <ref>:<path>`.
5. **Branch matrix** → `reference/branch-matrix.md`. Check every relevant branch/environment:
   is the fix, the bug, or the plan's code already there? Under which ticket?
6. **Blast radius** → `reference/blast-radius.md`. Every consumer, copy, submodule, DB,
   topic, permission, release path.
7. **Test cases and self-testing** → `reference/test-case-taxonomy.md` (all kinds) and
   `reference/self-testing-guidelines.md` (what the implementing engineer or AI agent must run:
   Jasmine+Karma for UI, JUnit 5+Mockito, API tests and others for BE, failing-first test,
   evidence block). Check the plan commits to them; after implementation check the evidence.
8. **Score** → `reference/rubric.md` (weights, anchors, hard caps, verdict bands), applying
   `reference/rules.md` (PR-01…PR-27) as the checklist for deductions.
9. **Report** → `templates/review-report.md`; Redmine form → `templates/redmine-review-comment.md`
   (post only if asked). Always end with a developer start-guide: ordered, file-level steps
   with line numbers. Authors fill `templates/plan-submission-template.md`.
10. **Gap analysis and revised plan** → `reference/revision-protocol.md`. Below APPROVED (or on
    request): list every gap (reviewer-closable vs author-only), write a **better plan** in the
    submission-template shape with verified line numbers, and show the **old plan's score next
    to the revised plan's projected score** (per dimension, with caps). Keep the old score
    verbatim; never invent evidence; revised score stays "projected" until re-review.

## Non-negotiables

- No evidence citation → no credit. Cite `repo@branch:path:line`, query, or ticket journal id.
- "Checked" must name the ref and its commit date; say when refs may be stale.
- Plan checkboxes and "implemented / confidence 95" are claims; verify or mark UNVERIFIED.
- Any shared code (submodule, per-app copy, util) needs a consumer list or the blast score caps.
- HIGH/CRITICAL risk (DB/Flyway, auth, permissions, billing, patient data) cannot be approved
  by score alone: contract §9 human gate applies.
- Say what was **not** checked (logs, a branch, a DB) in the report. Gaps are findings.
