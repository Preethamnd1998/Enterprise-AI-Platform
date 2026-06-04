# Review / Quality Log (v3)

Records code-quality findings produced during a task. In v3 there is no separate Review
agent — the single agent self-reviews against standards and the two gates before "done".

## Record format

```text
Review ID:        REV-YYYY-MM-DD-001
Task / Agent:     Bug Fix | Planning | UI Redesign | Migration
Standards checked:  Coding · Java · Angular · Repository · Migration (as applicable)
Findings:         Critical / Major / Minor
Security findings:  list
Performance findings:  list
Gates:            Completeness (§7) + Regression (§8) result
Recommendation:   APPROVED | APPROVED WITH CHANGES | REJECTED
Final status:     PASS | FAIL
```

## Example

```text
Review:          REV-2026-06-03-001
Agent:           Planning
Findings:        Minor — unused import in analog reference (not in scope)
Gates:           Completeness PASS · Regression PASS
Recommendation:  APPROVED
```
