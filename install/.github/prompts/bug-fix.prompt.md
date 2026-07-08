---
description: Bug Fix — trace-driven root cause and minimal-diff fix. No repo scan.
mode: agent
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---

# /bug-fix

Follow the shared contract: [.github/ai-platform/shared/contract.md](../ai-platform/shared/contract.md).

Input: `${input:issue:Redmine ID, stack trace, or error}`.

Specialization: the stack trace IS the dependency map — parse it, do not search. Read only
own-package frames; blame the failing line; expand depth-1 to the failing symbol only.
Lazy-load the standard for the failing layer + coding-standards.

Deliver: root cause · affected files · minimal diff · completeness (§7) + regression (§8) ·
audit line. Budget ≤ 10 files, ≤ 6k tokens. Stop at confidence > 90%.
