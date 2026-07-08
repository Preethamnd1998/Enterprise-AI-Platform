# Roo Code Adapter — STUB (Phase F / FT-082)
<!-- adapters/roo-code/STUB.md — Future adapter skeleton. Not yet implemented.
     See capability-map.yml for current known capabilities. -->

## Status

STUB — not implemented. Activation requires evidence gate (see below).

## Platform

[Roo Code](https://github.com/RooVetGit/Roo-Code) — VS Code extension; Cline fork with enhanced modes.

## Evidence Gate

Implement this adapter when:
- Roo Code `.roo` rules format is confirmed stable
- Roo Code usage at Lifetrenz is confirmed (≥1 engineer using it regularly)

## Planned Adapter Scope (when activated)

1. Inject contract kernel via `.roo/rules/` or equivalent system rules path
2. Copy standards and rules under `.roo/ai-platform/`
3. Commands: evaluate Roo Code mode system for command equivalents
4. Audit logging: evaluate event API

## Files to Create (when activated)

See `file-map.yml` for source → destination mapping.
