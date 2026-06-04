# AI Execution Log (v3)

Audit trail for AI-assisted development under Enterprise AI Platform v3. One record per task.

## Record format

```text
Execution ID:     EXEC-YYYY-MM-DD-001
Timestamp:        start / end / duration
Agent:            Bug Fix | Planning | UI Redesign | Migration   (exactly one)
Migration mode:   exact | functionality        (migration only)
Input:            Redmine ID | MR | commit(s) | branch | release range | description
Standards loaded: e.g. Backend/* (lazy, language-scoped)
MCPs used:        from 04-MCP/tool-allowlists.md (≤ 2 servers, ≤ 10 calls)
Files read / modified / created:  lists
Discovery:        change set (files + hunks) — deterministic, no repo scan
Dependency:       depth-1 neighbors (and any logged expansion)
Validation:       Completeness (§7) PASS/FAIL · Regression (§8) PASS/FAIL
Risk gate (§9):   auto-approved | approval obtained
Tokens:           total (and cache hit %)
Outcome:          PASS | FAIL | PARTIAL — reason
Follow-up:        yes/no — tasks
```

## Example

```text
Execution ID:   EXEC-2026-06-03-001
Agent:          Migration
Migration mode: functionality
Input:          Redmine LT-43115 → MR !8456
Target:         develop
MCPs:           redmine-reader, gitlab-reader
Files modified: RuleAssignmentController.java, RuleAssignmentService.java
Files created:  V246__rule_assignment.sql, RuleAssignment.java
Validation:     Completeness PASS · Regression PASS
Tokens:         ~14k (cache hit 82%)
Outcome:        PASS — capability migrated; delta-vs-target only
```
