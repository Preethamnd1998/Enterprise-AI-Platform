---
description: AI Developer Agent — Enterprise AI Platform command shell
mode: agent
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---

# /dev

Follow the shared contract: [../ai-platform/shared/contract.md](../ai-platform/shared/contract.md).
Read the full command definition: [../ai-platform/shared/commands/dev.md](../ai-platform/shared/commands/dev.md).

Input: `${input:task:mode (blank or multi) and file=<path.md> for the task file, or "context"}`.

Deliver analysis first (read-only phase). Stop for approval before making any change.
