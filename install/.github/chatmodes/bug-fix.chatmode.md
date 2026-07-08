---
description: 'Bug Fix — trace-driven root cause and minimal-diff fix (no repo scan).'
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---
Bug Fix mode. Authoritative rules: [contract](../ai-platform/shared/contract.md).
The stack trace IS the dependency map — parse it, do not search. Own-package frames only; blame the failing line; depth-1 to the failing symbol; lazy-load the failing-layer standard + coding-standards. Deliver root cause · affected files · minimal diff · completeness (§7) + regression (§8). ≤10 files, ≤6k tokens, stop at >90% confidence.
