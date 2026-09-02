# Planning Engine (shared discovery → gap analysis → breakdown procedure)
<!-- Shared analysis procedure used by every implementation command's Phase 1, and
     directly by /planning when invoked standalone. Read-only, analysis-only —
     never edits files, never executes, never writes code.
     Referenced DIRECTLY from each calling command file (not via contract.md
     section-injection — that path is not reachable from the installed CLAUDE.md
     kernel; see the /planning rollout notes in registry.yml). -->

## Purpose

Produce the contract §12 analysis-block shape (`ROOT CAUSE / REQUIREMENT`,
`IMPACT ANALYSIS`, `IMPLEMENTATION BREAKDOWN`, `CHANGE ESTIMATE`) from whatever
current-state discovery the calling command already did. This file does not
resolve input and does not discover the change set — the calling command's own
Input Resolution + early discovery steps do that; this file only turns the
result into a gap analysis, an impact analysis, and a task breakdown.

## Parameters (set by the caller before reading this file)

- `domain`: `bug-fix` | `new-development` | `migration` | `ui-design-update` |
  `data-correction` | `planning`
- `current-state`: whatever the caller already resolved — a root cause + failing
  frames (bug-fix), a source-vs-target diff (migration), a nearest analog
  component (new-development), a bad-data state (data-correction), or an
  existing component vs a design reference (ui-design-update).

## Step 1 — Current Functionality (what exists today)

**Knowledge graph first (kernel F-KG):** before the caller's own discovery
(or a Grep/Glob scan) to establish what exists today, check whether a
`knowledge-graph` MCP server is connected. If it is, use
`search_knowledge`/`get_context_pack` to locate the target, then
`get_service_context`/`get_api_context`/`trace_business_flow`/
`find_dependencies` for the specifics — it returns exact files/classes/
methods to read directly, which is almost always cheaper than scanning.
Keep each fact's confidence (VERIFIED/INFERRED/UNRESOLVED); fall back to a
scoped scan only when the server isn't connected or a query is unresolved.

State plainly what the current-state input shows exists right now. If nothing
comparable exists (a true greenfield feature), say so explicitly — do not
invent a "current state."

## Step 2 — Gap Analysis (current vs desired)

Every domain already does this implicitly; make it explicit here:

| Domain | "Current" | "Desired" | Gap = |
|---|---|---|---|
| bug-fix | code as written | code without the defect | the root-caused delta |
| new-development | nearest analog feature | the requested feature | what the analog lacks |
| migration | source branch/MR/commit | target branch | functional hunks + compile/capability gaps |
| data-correction | bad data state | correct final state | the corrective operations needed |
| ui-design-update | existing component | design reference / bug-free UI | structural/binding delta |

State the gap as a short list of concrete deltas, not prose. This list is what
Step 5 turns into tasks.

## Step 3 — Environment & Status Reasoning (only when the input carries a Redmine ticket or an environment signal)

Skip this step entirely if the task has no ticket/environment context (e.g. a
bare stack trace or a local file path).

**Comment priority (Redmine):** read journals bottom → top. Latest QA finding /
latest deployment failure / latest rejection comment outranks the original
description.

**Environment keyword → likely issue source** (do not jump to business-logic
conclusions before ruling these out):

| Keyword in ticket/prompt | Status | Likely issue source | Query these MCPs first (if domain needs DB access) |
|---|---|---|---|
| local, dev, beta, "BETA BUG" | Beta Bug | Implementation regression — check recent MR | `mcp__local-*-service-db__query`, `mcp__canary_mongo_db__*` |
| V2QA, RC, "RC failed" | RC Failed | Config/deployment/schema mismatch, not business logic | `mcp__v2qa-*-service-db__query` |
| SIT, "QA failed" | QA Failed | Integration/permission/dataset gap between DEV and SIT | ask the user which SIT-tier MCP is provisioned — none is currently in the standard allowlist; do not guess a name |
| UAT, "UAT failed", customer | UAT Failed | Real-world workflow edge case — minimal-risk fix only | `mcp__aster-uat-core-db__query`, `mcp__medvista-qa-core-db__query` |
| canary, "canary-dev" | Canary/Pre-prod | Pre-prod validation | `mcp__canary-*-service-db__query`, `mcp__canary_mongo_db__*` |
| smiles-stage | Stage | Staging validation | `mcp__smiles-stage-*-service-db__query` |
| (none) | New / Beta Bug | Infer from context; default to local-tier MCPs | `mcp__local-*-service-db__query` |

MCP names above are the actual configured allowlist — verify against
`.claude/settings.json` before use rather than trusting this table blindly if
the allowlist has since changed. **Never query a higher-tier environment than
the one the ticket names.**

**MR analysis is mandatory** (not optional) when the ticket status is Beta Bug,
RC Failed, or QA Failed and an MR is linked.

## Step 4 — Impact Analysis

```text
## IMPACT ANALYSIS
Affected Areas: UI · Backend · Database · Integrations · APIs · Reports
Risk Level: Low / Medium / High
```

Risk level follows contract §9: DB/Flyway, permissions, security, auth,
billing/financial/patient data, or application-scope changes are High/Critical
regardless of domain.

## Step 5 — Implementation Breakdown

Turn the Step 2 gap list into a `PART → PHASE → TASK` tree, one PART per
architectural layer touched (Backend, UI, Database, Integration). Do not
invent tasks beyond what the gap list justifies — no speculative cleanup, no
unrelated refactors.

```text
## IMPLEMENTATION BREAKDOWN
PART N - <area>
  PHASE N.N - <topic>
    TASK N.N.N <description>
```

## Step 6 — Change Estimate

```text
## CHANGE ESTIMATE
Files Read: N | Est. Files Modified: N | UI: N | Backend: N | DB Objects: N
Complexity: Small / Medium / Large / XLarge
```

## Delegation (opt-in only — never automatic)

This platform runs as a single reasoning agent by default (contract C4). This
engine does **not** route work to named specialized agents. If a task
genuinely spans backend + database + UI and the caller was invoked with
`agents=N` (max 3), reuse `/dev`'s existing Multi-Agent Mode split — the
calling command's own agent remains responsible for planning, coordination,
and approval; sub-agents never self-approve or report directly to the user.
Do not spawn agents when `agents=N` was not set, regardless of how many layers
the gap analysis touches.
