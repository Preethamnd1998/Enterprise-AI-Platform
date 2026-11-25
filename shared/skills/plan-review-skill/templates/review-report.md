# Plan Review: <ticket id> <plan title>

Reviewed: <date> · Reviewer: <name/agent> · Plan author: <name> · Plan file: <path/attachment id>
Refs read: <repo@ref (tip date)>, … · Not fetched (refs may be stale): yes/no
**Score: N/100 → <APPROVED | APPROVED WITH CONDITIONS | REVISE | REJECT>** · Risk (§9): <LOW|MEDIUM|HIGH|CRITICAL>

## 1. Verdict in three lines
<what is right · what is wrong · what happens next>

## 2. Requirement trace
| # | Symptom / criterion (source) | Plan item | Test | Status |
|---|---|---|---|---|

## 3. RCA assessment
Mechanism · evidence · alternatives ruled out · symptoms not explained.

## 4. Code understanding (claims verified)
| Claim | Verified at (repo@ref:path:line) | Result | Tag |
|---|---|---|---|

## 4b. Change Map check (bug fixes)
| # | Plan row (repo@branch, file, lines) | Verified on ref | Result (OK / wrong lines / wrong file / no symptom) | Correct lines |
|---|---|---|---|---|
Rows OK: N/M · Edits the plan omits: <tests, sibling apps, pointer bumps, translations>

## 5. Branch matrix
| Repo | Ref (tip date) | Bug present? | Fix/plan code present? | Evidence | Gap |
|---|---|---|---|---|---|

Where the bug is live · where the fix already is · what to backport and by which path.

## 6. Blast radius
Inventory (axes from `blast-radius.md`) · regression matrix · release path · rollback.

## 7. Data and logs
Counts/shapes only, per environment. **Not checked:** <list with the search a human should run>.

## 8. Test-case assessment
Kinds present / missing (taxonomy) · executability · missing cases to add.

## 8b. Self-testing assessment
| Area | Plan commits to (files, commands)? | Evidence after implementation | Gap |
|---|---|---|---|
| Failing-first test (bugs) | | | |
| UI Jasmine + Karma (`ng test`) | | | |
| UI production build run | | | |
| BE JUnit 5 + Mockito (`mvn test`) | | | |
| API tests (MockMvc) and black-box call | | | |
| DB / Mongo / Flyway / Kafka | | | |
| Consumer regression | | | |
Self-Test Evidence block present: yes / no. Skipped/focused tests left behind: yes / no.

## 9. Score
| Dim | Pts | Score | Evidence (one line) |
|---|---|---|---|
| D1 Requirement fit | 12 | | |
| D2 RCA | 15 | | |
| D3 Code understanding | 15 | | |
| D4 Branch and release | 10 | | |
| D5 Blast radius and risk | 15 | | |
| D6 Solution design | 10 | | |
| D7 Test plan | 15 | | |
| D8 Evidence and honesty | 8 | | |
| Caps applied | | | <which, or none> |
| **Total** | 100 | | |

`/plan-reviewer` view: Problem Understanding N · Code Understanding N · Test Plan N · Confidence N

## 10. Findings (rule id, severity, fix)
| Id | Rule | Severity (blocker/major/minor) | Finding | Required change |
|---|---|---|---|---|

## 11. Developer start-guide
Ordered, file-level steps with acceptance check per step; what to split into separate tickets;
release/promotion steps; exit criteria.

## 11b. Gap analysis
| Gap | Rule | Dim | Points lost | Evidence | Fix | Closable by (Reviewer / Author) |
|---|---|---|---|---|---|---|

## 11c. Score comparison (old plan vs revised plan)
| Dim | Pts | Old plan | Revised (projected) | Δ | Still open (author-only) |
|---|---|---|---|---|---|
| D1 … D8 | | | | | |
| Caps | | | | | |
| **Total / verdict** | 100 | N / VERDICT | N / VERDICT | +N | |

Score history: round 1 (old plan) N → round 2 (revised, projected) N → … (max 3 rounds).
Revised plan written to `<id>-plan-REVISED.md`; this review to `<id>-plan-REVIEW.md`. The
old score above is unchanged; the revised score is **projected** until re-review confirms it.

## 12. Revised test cases
ID · requirement · kind · precondition · steps · expected · env/branch · priority.
