# Planning / Feature Example (v3)

## Input

Requirement: Add **Patient Preferred Language** field.

## Planning / Feature Agent

**Discovery (insertion point, not "the feature"):** nearest analog = existing Patient
demographic fields. Read structure/signatures of `Patient` entity + `PatientPostDTO`/
`PatientGetDTO` + `PatientMapper` + registration component (signatures only, ~4 files).

**Plan (by analogy, every layer covered):**
- Flyway `V245__add_preferred_language.sql`
- `Patient.java` (field), `PatientPostDTO` / `PatientGetDTO`, `PatientMapper`
- `PatientRegistrationComponent` (form control + label/translation)
- Tests: entity mapping + form submission

**Test strategy:** unit (mapper/DTO), integration (save + fetch), regression (existing
registration flow unaffected).

**Plan-completeness check:** entity · DTO · mapper · service · UI · Flyway · validation · tests — all present.

Status: **PASS** (plan only; no implementation in planning).
