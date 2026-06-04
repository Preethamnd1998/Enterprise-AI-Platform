# GitHub Copilot Governance v3

Aligns GitHub Copilot with Enterprise AI Platform v3 and Lifetrenz standards.

## Core principles

- Read before write. Reuse existing components/services/APIs and patterns.
- Preserve contracts, APIs, validations, permissions.
- Small, reviewable diffs. Avoid creating new patterns/architectures when standards exist.

## Sources of truth

Follow `00-Enterprise-Knowledge` standards (scoped to the languages you touch) and the
operating policy in `01-Agent-OS/agent-os.md`. Agent behavior is defined in
`02-Main-Agents/agents.md`. No workflows or sub-agent chains.

## Migration rules (BOTH modes supported)

Copilot must support both migration modes — do **not** restrict migration to
functionality only:

- **Mode 1 — Exact migration (diff-based):** migrate the actual changes from a
  commit, merge request, branch, or release range. Drop non-functional noise
  (whitespace, comment-only, import-reorder, formatting). Produce the smallest
  functional patch; pull a dependency only when the target won't compile without it.
- **Mode 2 — Functionality migration (capability-based):** migrate the whole business
  capability — controller, service, repository, DTO, mapper, entity, validation, SQL/
  Flyway, Angular, routes, permissions, translations, tests — even artifacts not in the
  original diff. Completeness-first, dependency-aware, bounded by module + budget.

The retired rule "migrate functionality, not commits, not files" is **removed** — it
conflicts with Mode 1.

## Validation

Every change must pass completeness (`agent-os.md` §7) and regression (`agent-os.md` §8:
existing APIs/UI/permissions/integrations/Flyways/DB/tests still work). Respect the risk
gate (§9).

## Success criteria

Enterprise-compliant, minimal-diff code generation with no regressions.
