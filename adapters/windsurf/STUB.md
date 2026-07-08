# Windsurf Adapter — STUB (Phase F / FT-082)
<!-- adapters/windsurf/STUB.md — Future adapter skeleton. Not yet implemented.
     Evidence gate: adopt when Windsurf plugin/rules API is confirmed stable.
     See capability-map.yml for current known capabilities. -->

## Status

STUB — not implemented. Activation requires evidence gate (see below).

## Platform

[Windsurf](https://codeium.com/windsurf) — Codeium's AI-native IDE (VS Code fork).

## Evidence Gate

Implement this adapter when:
- Windsurf `.windsurfrules` or equivalent config format is confirmed stable
- Windsurf usage at Lifetrenz is confirmed (≥1 engineer using it regularly)

## Planned Adapter Scope (when activated)

1. Install `.windsurfrules` from `shared/contract.md` kernel
2. Copy standards and rules under `.windsurf/ai-platform/`
3. Expose commands via Windsurf custom prompt format (if available)
4. Audit logging: unsupported until Windsurf exposes a hook API

## Files to Create (when activated)

See `file-map.yml` for source → destination mapping.
