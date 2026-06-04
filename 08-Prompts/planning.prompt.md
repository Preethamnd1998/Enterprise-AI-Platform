# Planning / Feature Prompt (v3)

Operate under `CLAUDE.md`. Run the **Planning / Feature** agent profile
(`02-Main-Agents/agents.md`, Agent 2) under `01-Agent-OS/agent-os.md`. Tools per
`04-MCP/tool-allowlists.md`.

Feature request:

{FEATURE_REQUIREMENT_OR_REDMINE_STORY}

Rules:

- Discover the insertion point — the nearest existing analog feature to extend — not "the feature".
- Read structure/signatures of one analog module, not implementations.
- Reuse existing patterns; do not invent new architecture when standards exist.
- Lazy-load standards for the touched layers. 3–5 files, ≤ 10k tokens, < 5s.

Return:

1. Requirement analysis
2. Impact analysis (affected layers/modules)
3. Technical design + implementation task breakdown
4. Test strategy
5. Plan-completeness check (every layer covered)
