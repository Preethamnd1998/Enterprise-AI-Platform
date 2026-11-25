# Plan: Plan-Review Skill for Junior-Engineer Plans

**Status:** implemented in `shared/skills/plan-review-skill/` (2026-11-25) · **Owner:** platform
**Problem:** Plans written by junior engineers reach review with ticked checklists, unverified
claims and no branch or blast-radius analysis. Example: Redmine #50950 (a plan "ready for
execution" whose fix already lived on V2-QA, targeted the wrong file, and listed one of 13
consuming apps). The existing `/plan-reviewer` command scores four headline numbers but has no
branch matrix, blast-radius method, hard caps, test taxonomy or junior-specific rules.

## Goals
1. Review every plan against **all relevant branches/environments** (development, V2-QA,
   Medvista-QA/UAT/PROD, Aster), not the working tree.
2. Map **blast radius** for the change and for every related issue (consumers, copies,
   submodules, DB, topics, permissions, release path).
3. **Score** from a fixed rubric with weights, anchors, hard caps and verdict bands.
4. Enforce **checking rules** (PR-01..PR-27) so reviews are consistent across reviewers.
5. Require **test cases of all kinds** (taxonomy, minimum set by risk).
6. Review the **plan, RCA, requirement and code understanding** separately, with a
   traceability matrix.
7. End with a **developer start-guide** so work can begin.
8. Require **bug-fix plans to carry a line-level Change Map** (repo@branch, file, line range,
   symbol, change, why) that the reviewer verifies against each branch (PR-25).
9. Define **self-testing guidelines** for whoever implements, human or AI agent: failing-first
   test; UI Jasmine+Karma; BE JUnit 5+Mockito, API tests, DB/Kafka checks; production-build
   run; consumer regression; Self-Test Evidence block (PR-26, PR-27). Embedded in the plan
   template so authors commit to it up front.

## Non-goals
Writing the first draft of a plan (`/planning`), implementing (`/dev`), posting to Redmine by
default, changing contract §0-§18 or the hash-pinned kernel.

## Design
| Piece | Path | Role |
|---|---|---|
| Skill index | `shared/skills/plan-review-skill/SKILL.md` | 9-step workflow, non-negotiables (lazy-loaded) |
| Rubric | `reference/rubric.md` | 8 dimensions = 100 pts, anchors, caps, bands, `/plan-reviewer` mapping |
| Rules | `reference/rules.md` | PR-01..PR-27 + junior red flags |
| Branch matrix | `reference/branch-matrix.md` | per-repo, per-ref procedure, ancestry + content checks, no-fetch rule |
| Blast radius | `reference/blast-radius.md` | 16-axis inventory, §9 risk class, regression matrix |
| RCA / requirement / code | `reference/rca-and-requirement.md` | traceability matrix, 5-part RCA, claim verification |
| Test taxonomy | `reference/test-case-taxonomy.md` | 18 test kinds, case quality bar, minimum by risk |
| Self-testing guidelines | `reference/self-testing-guidelines.md` | what implementers/AI agents must run and evidence; aligned to `shared/standards/testing/` |
| Worked example | `reference/worked-example.md` | #50950 calibration |
| Templates | `templates/plan-submission-template.md` (author fills; Change Map + self-testing sections), `templates/review-report.md`, `templates/redmine-review-comment.md` | submission, report, optional Redmine post |
| Command hook | `shared/commands/plan-reviewer.md` | loads the skill for rubric/method; keeps its 4 scores and threshold |

Contract fit: single agent, read-only, lazy-loaded references, graph-first, evidence tags,
§9 human gate for HIGH/CRITICAL, no sub-agents.

## Rollout
1. Merge skill + command hook + CHANGELOG entry. 2. Regenerate the plugin bundle (`dist/`)
with the platform's normal build/install so `~/.claude/skills/` picks it up; run
`ci/validate.sh` (frontmatter check). 3. Pilot on 3 open junior plans; compare skill scores
with a senior reviewer's. 4. Tune weights/caps from disagreements. 5. Add an
`ai-platform-drift` CI check if the rubric is ever copied elsewhere (it must not be).

## Acceptance
- `ci/validate.sh` passes; skill name equals directory name; frontmatter has `name` and
  `description`.
- Re-running the skill on #50950 reproduces the 38/100 result and the same findings
  (branch fix on V2-QA only; 13-app submodule; Plan 101 rejected).
- A review without branch evidence cannot exceed 79; without test cases cannot exceed 69.
- SKILL.md stays an index (< 80 lines); detail lives in `reference/`.

## Risks
| Risk | Mitigation |
|---|---|
| Rubric too strict, junior engineers discouraged | Revise bands after pilot; findings carry required changes, not just deductions |
| Stale local refs give wrong branch verdicts | Record tip dates; ask before fetching; state staleness |
| Reviewers game the weights | Caps and evidence rules; worked example calibration |
| Overlap with `/plan-reviewer` | Skill = method, command = runner; mapping table keeps scores comparable |
