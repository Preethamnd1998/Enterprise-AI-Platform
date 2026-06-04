# Decision Log (v3)

Tracks major decisions made during AI-assisted tasks. Provides traceability; prevents
repeated investigation.

## Record format

```text
Decision ID:        DEC-YYYY-MM-DD-001
Task / Agent:       Bug Fix | Planning | UI Redesign | Migration
Context:            why a decision was required
Decision:           what was decided
Reasoning:          concise justification (conclusions only, no chain-of-thought)
Alternatives:       options considered
Impact:             modules / APIs / DB / UI / permissions affected
Validation:         Completeness (§7) + Regression (§8) result
```

## Example

```text
Decision ID: DEC-2026-06-03-001
Task/Agent:  Bug Fix
Decision:    Send pageSize.value instead of the pageSize object.
Reasoning:   API expects an integer; component emitted {label,value}.
Impact:      Pagination (lib-bom-configuration).
Validation:  Completeness PASS · Regression PASS
```
