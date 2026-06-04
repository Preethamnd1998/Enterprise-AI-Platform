# Enterprise AI Platform v3 — Copilot Instructions

All code generation complies with Enterprise AI Platform v3. Authoritative files:
`CLAUDE.md`, `01-Agent-OS/agent-os.md`, `02-Main-Agents/agents.md`,
`04-MCP/tool-allowlists.md`. There are no workflows or sub-agent chains.

## Load order

1. Entrypoint `CLAUDE.md` (routing + lazy-loading)
2. `agent-os.md` (operating policy)
3. The relevant agent profile in `agents.md`
4. Task

Load `00-Enterprise-Knowledge` standards lazily, scoped to the languages you touch
(coding standards always; Java/Spring, Angular, SQL/Flyway, Migration as relevant).

## Task routing (4 agents only)

- Bug / error / stack trace → **Bug Fix** (Agent 1)
- Feature / story / epic → **Planning / Feature** (Agent 2)
- Screenshot / component to modernize → **UI Redesign** (Agent 3)
- Redmine→MR / MR / commit / branch / release range → **Migration** (Agent 4)

## Execution rules

- One agent per task. Deterministic discovery; never scan the repository.
- Hunks not files; signatures not bodies; depth-1 by default.
- Small, surgical diffs. Reuse existing patterns; don't invent new architecture.

## Migration — both modes supported

- **Exact (diff-based):** commit/MR/branch/release/diff → smallest functional patch.
- **Functionality (capability-based):** full capability, completeness-first, bounded.

(The retired "migrate functionality, not files/commits" rule is removed.)

## Validation (both gates mandatory)

- Completeness (`agent-os.md` §7): every required artifact present.
- Regression (`agent-os.md` §8): existing APIs/UI/permissions/integrations/Flyways/DB/tests still work.
- Respect the risk gate (§9) for High/Critical changes.

## Output

Findings → plan → implementation → validation. Concise. Prefer small diffs.
