# Bug Fix Prompt (v3)

Operate under `CLAUDE.md`. Run the **Bug Fix** agent profile (`02-Main-Agents/agents.md`,
Agent 1) under `01-Agent-OS/agent-os.md`. Tools per `04-MCP/tool-allowlists.md`.

Task:

{BUG_DESCRIPTION_OR_REDMINE_ID_OR_STACK_TRACE}

Rules:

- The stack trace IS the dependency map — parse it; do not search the repo.
- Read own-package frames only (skip framework frames); blame the failing line.
- Smallest scope; preserve existing functionality, APIs, validations, workflows.
- Lazy-load only the standards for the language in the trace. ≤ 10 files, ≤ 6k tokens.
- Stop at root-cause confidence > 90%.

Return:

1. Root cause
2. Affected files
3. Fix plan + code changes (small diff)
4. Completeness (§7) + Regression (§8) validation
