# VS Code Agent Mode Adapter — STUB (Phase F / FT-082)
<!-- adapters/vscode-agent/STUB.md — Future adapter skeleton. Not yet implemented.
     VS Code Agent Mode (GitHub Copilot Edits / Agent) uses .github/copilot-instructions.md
     but has its own agent execution model distinct from Copilot Chat.
     See capability-map.yml for current known capabilities. -->

## Status

STUB — not implemented. Activation requires evidence gate (see below).

## Platform

[VS Code Agent Mode](https://code.visualstudio.com/docs/copilot/copilot-edits) — GitHub Copilot
Edits in VS Code with autonomous multi-file editing capabilities.

## Evidence Gate

Implement this adapter when:
- VS Code Agent Mode `.github/copilot-instructions.md` injection is confirmed stable
- Agent Mode exposes hook events for audit logging; OR
- VS Code Agent Mode usage at Lifetrenz is confirmed (≥1 engineer using it regularly)
- Note: evaluate overlap with existing `adapters/copilot/` before creating a separate adapter

## Planned Adapter Scope (when activated)

1. Inject contract kernel via `.github/copilot-instructions.md` (shared with Copilot adapter)
2. Evaluate whether a separate adapter is needed vs extending the existing copilot adapter
3. Copy standards and rules under `.github/ai-platform/`
4. Hook API: evaluate VS Code extension event API for audit equivalent

## Files to Create (when activated)

See `file-map.yml` for source → destination mapping.
