# Migration Log (v3)

Tracks all migrations: exact (cherry-pick, hotfix, backport, branch sync) and
functionality (feature port, cross-version, module replication).

## Record format

```text
Migration ID:   MIG-YYYY-MM-DD-001
Mode:           exact | functionality
Source:         Redmine ID | MR | commit(s) | branch | release range
Target branch:  develop | release/* | hotfix/*
Files modified / created / skipped (identical-on-target)
Dependency / capability map:  depth-1 (exact) or bounded closure (functionality)
Validation:     migration-checklist.md + Completeness (§7) + Regression (§8) → PASS/FAIL
Target-compatibility (release/backport): API · DB · Flyway · permissions
Risks / gaps:   any unmet checklist items
Final status:   PASS | FAIL
```

## Example

```text
Migration:    LT-43115 (MR !8456)
Mode:         functionality
Target:       develop
Status:       PASS — dependencies complete, regression PASS, delta-vs-target migrated
```
