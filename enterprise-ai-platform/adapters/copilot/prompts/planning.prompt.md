---
description: Planning / Feature — impact analysis, technical design, task breakdown, test strategy. Reads structure, not implementations.
mode: agent
tools: ['codebase', 'search', 'fetch']
---

# /planning

Follow the shared contract: [.github/ai-platform/shared/contract.md](../ai-platform/shared/contract.md).
Repo profile: [.github/ai-platform/REPO.md](../ai-platform/REPO.md).

Input: `${input:request:Redmine ID or feature requirement}`.

Specialization: discover the **insertion point** (nearest existing analog feature to extend),
not "the feature". Read structure/signatures only. Reuse existing patterns; do not invent
new architecture. Lazy-load only the standards for the layers you will touch.

Deliver: requirement analysis · impact analysis · technical design · task breakdown · test
strategy · plan-completeness check. No code. Budget ≤ 10k tokens.

> Copilot limitation: tool/MCP restriction is best-effort here; rely on read-only MCP
> credentials for hard governance (see contract §9 and repo governance).
