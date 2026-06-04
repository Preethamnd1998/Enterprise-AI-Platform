# Migration Example (v3 — both modes)

## Input

Redmine: `LT-43115` → resolves to MR `!8456`. Target branch: `develop`.

## Migration Agent — Mode selection

### Mode 1 — Exact (e.g., backporting just the fix)
**Discovery:** `get_merge_request_diffs(!8456)` → functional hunks in
`RuleAssignmentController`, `RuleAssignmentService`. Diff semantic filter drops an
import reorder. **Compile-gap check on target:** `RuleAssignmentService.assign()`
exists on `develop` → no extra pull. Output: minimal 2-file patch.

### Mode 2 — Functionality (porting the whole capability)
**Closure (convention + typed refs, bounded):** controller → service → repository →
`RuleAssignmentPostDTO` → mapper → entity; Angular component → service → API; Flyway.
**Delta vs target:** entity + Flyway missing on `develop` → migrate those in full;
controller/service present & compatible → signature-check only.

## Validation (both modes)

`07-Templates/migration-checklist.md` + completeness (§7) + regression (§8: existing
rule-assignment APIs/UI/tests still pass). Build + tests: PASS.

Status: **PASS**.
