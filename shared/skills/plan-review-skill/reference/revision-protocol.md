# Revision Protocol: gap analysis, better plan, old score kept

The reviewer does not stop at a verdict. After scoring, analyse the gaps and, when the plan is
below APPROVED or the author asks, produce a **better plan** next to the **old plan's score**.
The old score is a record: never overwrite or soften it.

## When to produce a revised plan

| Verdict | Action |
|---|---|
| APPROVED (≥ 90) | No revision; list optional improvements |
| APPROVED WITH CONDITIONS (75-89) | Revised plan optional; conditions listed as exact edits |
| REVISE / REJECT (< 75) | Always: gap analysis + revised plan + score comparison |
| Author asks | Always |

## Steps

1. **Freeze the old review.** Keep the full old score table (D1-D8, caps applied, verdict,
   findings with rule ids). It goes into the output unchanged.
2. **Gap analysis.** One row per finding:
   `Gap · rule (PR-nn) · dimension · points lost · evidence · fix · who can close it`.
   Mark each gap **Reviewer-closable** (verifiable now from code, git, DB, logs, tickets) or
   **Author-only** (BA decision, environment access, a test not yet run, a reproduction).
3. **Build the revised plan** in `templates/plan-submission-template.md` shape, keeping what
   was right in the author's plan and rewriting what was not:
   - Re-verify and fill the **Change Map** with correct file and line numbers per branch.
   - Complete the branch matrix, blast radius, regression matrix and release path.
   - Replace the RCA with the proven one; move unproven items to "suspected".
   - Split scope creep into named follow-up tickets.
   - Full test cases (all kinds) and the **self-testing plan** (`self-testing-guidelines.md`).
   - Ordered delivery steps with a done-when for each.
   Mark every change `[R-n → finding id]` so the author can see what moved and why.
4. **Honesty rules.** Add only facts you verified, each with a citation. Never invent
   evidence, test results or BA decisions. Anything Author-only stays as an explicit
   `OPEN:` item with the exact question or check. Never claim the revised plan is
   approved by your own rewriting.
5. **Project the new score** with the same rubric and caps. Score the revised plan as written:
   Reviewer-closable gaps count as closed; Author-only gaps keep their caps. Label it
   **projected**. It becomes **confirmed** only after the author accepts the plan and a
   re-review verifies the remaining items (and, after implementation, the Self-Test Evidence).
6. **Score comparison table** (always shown together):

   | Dim | Pts | Old plan | Revised (projected) | Δ | Still open (Author-only) |
   |---|---|---|---|---|---|
   | D1 … D8 | | | | | |
   | Caps | | listed | listed | | |
   | **Total / verdict** | 100 | N / VERDICT | N / VERDICT | +N | |

7. **Loop.** Re-review a revised plan with the same rubric: keep a **score history**
   (round 1 old plan, round 2 revised, …). Maximum 3 rounds, matching `/plan-reviewer`'s
   `max-revisions`; at the cap, stop and report what remains.
8. **Write outputs next to the plan**, without overwriting it: `<id>-plan-REVIEW.md` (old
   score, findings, gap analysis, comparison) and `<id>-plan-REVISED.md` (the better plan).
   Redmine comment only when asked (`templates/redmine-review-comment.md`).

## Quality bar for a revised plan

A stranger can build it, QA can retest it, and a second reviewer would find nothing to send
back. Every line number was read from the ref, every claim has a citation, every symptom has a
plan item and a test, and the remaining unknowns are named.
