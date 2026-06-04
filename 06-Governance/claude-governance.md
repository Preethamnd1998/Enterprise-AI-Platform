# Claude Code Governance v3

Governance for Claude Code operating under Enterprise AI Platform v3. This file does
not define rules of its own — it points at the four authoritative files and enforces
how Claude Code uses them.

## Authoritative sources

1. `CLAUDE.md` — entrypoint, task routing, lazy-loading.
2. `01-Agent-OS/agent-os.md` — operating policy (budgets, discovery, dependency,
   completeness §7, regression §8, risk §9).
3. `02-Main-Agents/agents.md` — the four agent profiles + dual migration mode.
4. `04-MCP/tool-allowlists.md` — per-agent read-only MCP tool exposure.

There are no workflows, no sub-agents, and no agent chains. One main agent per task;
discovery, dependency expansion, and validation are deterministic steps that agent drives.

## Load discipline

- Load nothing eagerly. Read only the slice the task needs, when it needs it.
- Always-loaded core: `agent-os.md` + `tool-allowlists.md`. Standards load lazily,
  scoped to the languages in the change set (`CLAUDE.md` §4), once per session.

## Execution discipline

- Deterministic discovery (resolve the exact change set); never scan to find it.
- Hunks not files; signatures not bodies; depth-1 by default.
- Both validation gates apply: completeness (§7) AND regression (§8).
- Honor the risk gate (§9): High/Critical changes require approval before executing.

## Migration support (must support BOTH modes)

- **Mode 1 — Exact (diff-based):** commit / MR / branch / release-range / diff driven.
  Smallest functional patch; depth-1 only for compile-gaps.
- **Mode 2 — Functionality (capability-based):** capability closure, dependency-aware,
  completeness-first, bounded by module boundary + budget.

Governance explicitly permits diff-based migration. The old "migrate functionality, not
files/commits" single-philosophy is retired.

## Response discipline

Findings → plan → changes → validation. Concise, small diffs, surgical changes. No
essays. Stop when objective met and both validation gates pass.
