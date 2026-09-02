---
description: Analyse production/support data issues and generate correction scripts. Scripts are shown for manual review — never executed. Approval required before script generation.
argument-hint: "\"<issue description>\" | redmine=<id> | table=<name> | collection=<name> [id=<record>]"
allowed-tools: Read, Grep, Glob, Write, TodoWrite, mcp__redmine-reader__redmine_get_issue, mcp__gitlab-reader__get_file_contents, mcp__canary-core-service-db__query, mcp__canary-ipd-service-db__query, mcp__canary-inventory-service-db__query, mcp__canary-supplimentory-service-db__query, mcp__local-core-service-db__query, mcp__local-inventory-service-db__query, mcp__local-ipd-service-db__query, mcp__local-supplimentory-service-db__query, mcp__aster-uat-core-db__query, mcp__medvista-qa-core-db__query, mcp__medvista-qa-ipd-db__query, mcp__smiles-stage-core-service-db__query, mcp__smiles-stage-inventory-service-db__query, mcp__smiles-stage-ipd-service-db__query, mcp__smiles-stage-supplimentory-service-db__query, mcp__v2qa-core-service-db__query, mcp__v2qa-inventory-service-db__query, mcp__v2qa-invsupplimentory-service-db__query, mcp__v2qa-ipd-service-db__query, mcp__canary_mongo_db__find, mcp__canary_mongo_db__count, mcp__canary_mongo_db__aggregate, mcp__canary_mongo_db__collection-schema, mcp__canary_mongo_db__explain
---

# Command: /data-correction

<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **Data Correction**. Input: `$ARGUMENTS`.

> **SAFETY RULE (absolute, no override):**
> This command NEVER executes UPDATE, DELETE, INSERT, or Mongo write operations.
> All scripts are generated as text output for **manual review and execution by the user**.
> No `auto=true` override for execution — scripts always require manual execution.

---

## Mode Detection

**If `$ARGUMENTS` is empty → Session Mode.**
**If `$ARGUMENTS` is non-empty → Direct Mode** (skip to Input Resolution below).

---

## Session Mode (no args)

Print this banner exactly once and wait for user input:

```text
Data Correction Session started.  Skill loaded once.

Describe your data issue using any of:
  • Free text description     — "Patient bills showing wrong amounts after migration"
  • redmine=<id>              — Redmine support ticket
  • table=<table-name>        — target specific table
  • collection=<name>         — target specific Mongo collection
  • id=<record-id>            — sample affected record
  • file=<path>               — .md / .txt requirement or issue description
  • context                   — scan context/ folder (any filenames)

Scripts are generated for your manual review.  Nothing is executed automatically.

Type 'done' to end the session.
```

For each issue the user provides in this session:

1. Run **Input Resolution**, then **Phase 1 — Data Discovery & Analysis**.
2. Run **Script Generation Approval Gate** (always stops — no auto override).
3. After approval: generate **Correction Scripts**.
4. Append **Execution Summary** (contract §13).
5. Print: `─── Analysis complete. Scripts generated. Next issue? (or 'done') ───`
6. Wait for the next input. Repeat until user types `done`.
7. When user types `done`: print **Session Summary** (contract §13) and close.

**Token discipline:** Schema reads and standards already loaded this session are NOT re-read.

---

## Input Resolution

| Input | Action |
| --- | --- |
| Free text description | Extract: entity type, symptom, suspected root cause, environment |
| `redmine=<id>` | `redmine_get_issue` → extract issue description, sample IDs, affected tables |
| `table=<name>` | Use as the primary target table for SQL analysis |
| `collection=<name>` | Use as the primary target Mongo collection |
| `id=<record-id>` | Use as a sample record for tracing data lineage |
| `file=<path>` (.md / .txt / .html) | `Read` the file — extract issue details, table/collection names, sample IDs |
| `context` or `file=context` | `Glob context/**` → `Read` all files found — use as full input context |
| Patient ID / Order ID / Bill ID | Use as seed for data lineage trace |

---

## Phase 1 — Data Discovery & Analysis (SELECT queries only, no writes)

1. **Understand the data model:**
   - **Knowledge graph first (kernel F-KG):** if a `knowledge-graph` MCP
     server is connected, try `get_database_impact` first — it returns
     inferred tables read/written for a service/entity/API without a live
     query, useful for scoping which tables actually matter before touching
     the real database. Its table names are `inferred`, not `verified` —
     confirm against the live schema below before writing any correction.
   - Run `collection-schema` or equivalent for Mongo collections involved.
   - Run schema-inspection SELECT queries for SQL tables involved.
   - Trace foreign key relationships and collection references.

2. **Identify bad records:**
   - Run SELECT / `find` / `aggregate` queries to locate affected records.
   - Count impacted records: `SELECT COUNT(*)` / `count`.
   - Trace data lineage — follow relationships to find all affected entities.

3. **Determine root cause:**
   - Identify what operation or migration created the bad state.
   - Check GitLab or Redmine for related MRs / issues if `redmine=<id>` was provided.

4. **Build correction strategy:**
   - Identify the correct final state for the affected records.
   - Determine if UPDATE, DELETE, INSERT, or a combination is needed.
   - Identify rollback path.

Output analysis blocks (contract §12):

```text
## ROOT CAUSE / REQUIREMENT
<what data is wrong, why, and what the correct state should be>

## AFFECTED TABLES
<table-name>: N records affected
<table-name>: N records affected

## AFFECTED COLLECTIONS
<collection-name>: N documents affected

## ESTIMATED RECORD COUNT
Total affected: ~N records / documents

## CORRECTION APPROACH
<strategy: UPDATE / DELETE / INSERT / Mongo update — and in what order>
Rollback possible: Yes / No

## IMPACT ANALYSIS
Affected Areas: Database
Risk Level: Low / Medium / High

## IMPLEMENTATION BREAKDOWN
PART 1 - PRE-VALIDATION
  PHASE 1.1 - Verification Queries
    TASK 1.1.1 Verify current bad state
PART 2 - CORRECTION
  PHASE 2.1 - Correction Scripts
    TASK 2.1.1 <table/collection> correction
PART 3 - POST-VALIDATION
  PHASE 3.1 - Verification Queries
    TASK 3.1.1 Verify corrected state
PART 4 - ROLLBACK
  PHASE 4.1 - Rollback Scripts
    TASK 4.1.1 Undo correction if needed

## CHANGE ESTIMATE
Records Affected: ~N | Tables: N | Collections: N
Complexity: Small / Medium / Large / XLarge
Batch Size: N (if > 1000 records)
```

---

## Script Generation Approval Gate

**Always stops — no `auto=true` override applies to script generation or execution.**

STOP. Output the analysis blocks above and ask:

```text
Approve script generation? (approve / yes / proceed / implement)
```

---

## Script Generation Phase (after approval)

Generate scripts in this exact order. Never execute any of them.

### PART 1 — PRE-VALIDATION queries

SELECT queries to verify the current bad state before any changes.
Mongo: `find` / `count` / `aggregate` — read-only.

```sql
-- PRE-VALIDATION: verify affected records
SELECT ...
```

### PART 2 — CORRECTION scripts

Generate based on what is needed. Use batching/chunking for > 1000 records.

```sql
-- CORRECTION: <description>
-- Batch size: N  |  Estimated batches: N
UPDATE ...
DELETE ...
INSERT ...
```

For Mongo:

```javascript
// CORRECTION: <description>
db.<collection>.updateMany(...)
db.<collection>.deleteMany(...)
```

For large datasets (10,000+):

```sql
-- Chunked correction (process in batches of N)
UPDATE ... WHERE id BETWEEN :start AND :end LIMIT N;
-- Repeat for each batch
```

### PART 3 — POST-VALIDATION queries

SELECT queries to verify the corrected state.

```sql
-- POST-VALIDATION: confirm correction applied
SELECT ...
```

### PART 4 — ROLLBACK scripts (where possible)

Scripts to undo the correction if something goes wrong.

```sql
-- ROLLBACK: undo correction
UPDATE ...
```

---

## Safety Constraints

- Generated scripts are **output text only** — never passed to any MCP execute tool.
- Never call any write-capable MCP operation (no `update-many`, `delete-many`, `insert-many`, or SQL write tools).
- Only `SELECT`, `find`, `count`, `aggregate`, `explain`, `collection-schema` allowed during analysis.
- Always generate PRE-VALIDATION + CORRECTION + POST-VALIDATION + ROLLBACK as a set.
- For bulk corrections (> 1000 records): always use batching.
- Scripts include comments with record count estimates and batch information.

---

## Output

Root cause · affected tables/collections · record counts · correction approach ·
complete script set (pre-validation · correction · post-validation · rollback) ·
Execution Summary (contract §13).
Budget: ≤ 10 MCP calls per issue · ≤ 15k tokens per analysis.
