---
description: UI Redesign — modernize one Angular component from a screenshot/component. Depth-0, no backend.
mode: agent
tools: ['codebase', 'editFiles']
---

# /ui-redesign

Follow the shared contract: [.github/ai-platform/shared/contract.md](../ai-platform/shared/contract.md).

Input: `${input:component:Component name or pasted HTML}` (attach a screenshot if available).

Specialization: avoid repository analysis. The screenshot + the one component + Frontend
standards are the full spec. Depth-0; do not read backend/APIs/DB/routing. Lazy-load
`.github/ai-platform/standards/frontend/*` only.

Deliver: analysis · proposal · Angular HTML/CSS/TS changes · redesign-checklist result.
Preserve @Input/@Output/bindings, validations, permissions, workflows, APIs. Budget ≤ 8k tokens.
