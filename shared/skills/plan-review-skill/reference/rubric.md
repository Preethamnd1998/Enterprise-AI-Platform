# Scoring Rubric (preset, 100 points)

Score each dimension from verified evidence only. Use the anchors; interpolate sparingly.
Record one line of evidence per dimension. Then apply caps, then the verdict band.

| # | Dimension | Pts | Maps to `/plan-reviewer` score |
|---|---|---|---|
| D1 | Requirement fit and scope | 12 | Problem Understanding |
| D2 | Root cause analysis | 15 | Problem Understanding |
| D3 | Code understanding | 15 | Code Understanding |
| D4 | Branch and release awareness | 10 | Code Understanding |
| D5 | Blast radius and risk | 15 | Confidence |
| D6 | Solution design and proportionality | 10 | Confidence |
| D7 | Test plan | 15 | Test Plan |
| D8 | Evidence, honesty and executability | 8 | Confidence |
| | **Total** | **100** | |

Command mapping: Problem Understanding = (D1+D2)/27, Code Understanding = (D3+D4)/25,
Test Plan = D7/15, Confidence = (D5+D6+D8)/33, each rescaled to 0-100. Report both views.

## Anchors (full / mid / zero)

**D1 Requirement fit (12)**: 12 = every reported symptom and acceptance criterion traced to a
plan item, latest journal comments honoured, nothing extra. 6 = most covered; one symptom or
comment missed, or mild scope creep. 0 = plan solves a different problem than the ticket.

**D2 RCA (15)**: 15 = cause proven with evidence (code path, log line, data shape, repro),
alternatives ruled out, explains **all** symptoms. 8 = plausible and partly evidenced,
explains some symptoms. 0 = guess, or contradicted by code/data/logs. A fix that treats a
symptom while the cause is elsewhere is ≤ 5.

**D3 Code understanding (15)**: 15 = every file/class/method/table claim verified at
`file:line` on the target branch; current behaviour described from inspection; for bug fixes,
a Change Map whose every row (file, line range, symbol) checks out. 8 = most
verified, a few assumed. 0 = names things that do not exist or describes behaviour the code
does not have. Line numbers from a different checkout cost 3.

**D4 Branch and release awareness (10)**: 10 = checked every relevant branch (see
`branch-matrix.md`), knows where the bug, any existing fix, and the plan's code live, and the
promotion path (cherry-pick vs full release) is stated. 5 = development only plus one other.
0 = no branch check; assumes the working tree is the product.

**D5 Blast radius and risk (15)**: 15 = complete consumer/copy/submodule/DB/topic/permission
inventory, §9 risk class assigned, regression matrix and rollback stated. 8 = main consumers
listed, shared-code fan-out partly missing. 0 = "no breaking changes" with no inventory.

**D6 Solution design (10)**: 10 = minimal, right layer, framework-correct, alternatives
weighed, no unrelated refactors, every contract §7 layer present. 5 = works but heavier than
needed or one layer missing. 0 = would break existing behaviour (e.g. a change-detection or
lifecycle change that stops callbacks rendering) or fixes the wrong layer.

**D7 Test plan (15)**: 15 = all applicable kinds from `test-case-taxonomy.md`, concrete steps
with expected results, regression matrix across consumers, prod-build and data checks, **and
a self-testing plan** per `self-testing-guidelines.md` (named test files/commands, failing-first
test for bugs). 8 =
happy path plus some negatives, little regression. 0 = none. File referenced but absent = 0.

**D8 Evidence, honesty, executability (8)**: 8 = citations throughout, status claims match
reality, a developer can start from the plan without asking. 4 = some citations, a few
unverifiable claims. 0 = ticked checklists and confidence numbers with nothing behind them.

## Hard caps (apply after summing; lowest cap wins)

| Condition | Cap |
|---|---|
| Zero evidence citations in the plan or the review | total ≤ 50 |
| Root cause unproven or contradicted by evidence | total ≤ 59 |
| A reported symptom/acceptance criterion has no plan item | total ≤ 69 |
| No test cases and no test approach | total ≤ 69, D7 ≤ 6 |
| Shared code changed, no consumer list | total ≤ 69, D5 ≤ 7 |
| No branch check done (and none possible: say why) | total ≤ 79 |
| Plan says "implemented/verified" and the code is on no branch | D8 = 0, flag UNVERIFIED |
| Plan targets a checkout that matches no branch (stale line numbers) | D3 ≤ 8 |
| Bug-fix plan has no line-level Change Map | total ≤ 79, D6 ≤ 5 |
| Change Map rows that do not match the target branch (wrong file/lines) | D3 ≤ 8 for that share of rows; ≥ half wrong → D3 ≤ 4 |
| No self-testing plan (UI Jasmine+Karma / BE JUnit+Mockito / API as applicable) | D7 ≤ 8, total ≤ 79 |
| Bug-fix plan has no failing-first test | D7 ≤ 10 |
| Post-implementation review: no Self-Test Evidence block | D8 ≤ 2, status UNVERIFIED |
| HIGH/CRITICAL risk | verdict can be at most "Approve pending §9 human gate" |

## Verdict bands

| Score | Verdict | Meaning |
|---|---|---|
| 90-100 | APPROVED | Start development |
| 75-89 | APPROVED WITH CONDITIONS | Start after listed conditions are addressed in the plan |
| 50-74 | REVISE | Return to author with the gap list; re-review |
| 0-49 | REJECT | Rework from RCA; do not proceed |

A plan also needs **no dimension below 50% of its points** to be APPROVED; otherwise the
verdict drops one band. When invoked through `/plan-reviewer`, its `threshold=` per-score bar
still decides APPROVED FOR IMPLEMENTATION; the bands above guide the revision.

## Reviewer calibration

- Do not average away a fatal flaw: caps exist for that.
- Do not reward length. A 20-page plan with no evidence scores below a one-page evidenced one.
- Penalise confidence theatre ("95/100", "industry standard", "used by Netflix") at D8.
- Re-score after revision; show the delta per dimension.
