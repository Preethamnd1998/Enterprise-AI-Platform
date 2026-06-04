# Validation Log (v3)

Tracks the two mandatory validation gates across all tasks.

## Record format

```text
Validation ID:   VAL-YYYY-MM-DD-001
Task / Agent:    Bug Fix | Planning | UI Redesign | Migration
Gate:            Completeness (§7) | Regression (§8)
Checks performed:  list (e.g. controller/service/DTO/Flyway; existing APIs/UI/tests)
Result:          PASS | FAIL | WARNING
Missing / regressed items:  if FAIL
Resolution:      corrective action
Final status:    PASS | FAIL
```

## Example

```text
Validation:  VAL-2026-06-03-001
Agent:       Migration
Gate:        Completeness (§7)
Result:      FAIL
Missing:     PatientGetDTO not migrated to target
Resolution:  Re-run with the missing DTO; re-validate.
```
