# UI Redesign Prompt (v3)

Operate under `CLAUDE.md`. Run the **UI Redesign** agent profile
(`02-Main-Agents/agents.md`, Agent 3) under `01-Agent-OS/agent-os.md`. Tools per
`04-MCP/tool-allowlists.md`.

Input:

{SCREENSHOT_OR_HTML_OR_ANGULAR_COMPONENT}

Rules:

- Avoid repository analysis. The screenshot + component + Frontend standards are the spec.
- Depth-0: do not read backend/APIs/DB/routing.
- Preserve `@Input`/`@Output`/bindings, workflows, validations, permissions.
- Do NOT modify backend, APIs, database, or routes unless explicitly requested.
- Lazy-load `00-Enterprise-Knowledge/Frontend/*`. ≤ 5 files, ≤ 8k tokens + image.

Return:

1. Current UI analysis + problems
2. Proposed redesign (layout/typography/spacing/hierarchy)
3. Accessibility + responsive improvements
4. Angular HTML/CSS/TS changes
5. Functionality-preservation validation (use `07-Templates/redesign-checklist.md`)
