# Cline Adapter — STUB (Phase F / FT-082)
<!-- adapters/cline/STUB.md — Future adapter skeleton. Not yet implemented.
     See capability-map.yml for current known capabilities. -->

## Status

STUB — not implemented. Activation requires evidence gate (see below).

## Platform

[Cline](https://github.com/clinebot/cline) — autonomous AI coding agent; VS Code extension.

## Evidence Gate

Implement this adapter when:
- Cline exposes a stable system prompt or rules file injection point
- Cline usage at Lifetrenz is confirmed (≥1 engineer using it regularly)

## Planned Adapter Scope (when activated)

1. Inject contract kernel via Cline system prompt config (`.clinerules` if supported)
2. Copy standards and rules under `.cline/ai-platform/`
3. Commands: evaluate Cline slash command support; fallback to system prompt embedding
4. Audit logging: evaluate Cline event API

## Files to Create (when activated)

See `file-map.yml` for source → destination mapping.
