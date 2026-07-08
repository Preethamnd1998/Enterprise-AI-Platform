# Cursor Adapter — STUB (Phase F / FT-082)
<!-- adapters/cursor/STUB.md — Future adapter skeleton. Not yet implemented.
     Evidence gate: adopt when Cursor has a documented plugin/rules API that matches
     our command or hook model. See capability-map.yml for current known capabilities. -->

## Status

STUB — not implemented. Activation requires evidence gate (see below).

## Platform

[Cursor](https://cursor.sh/) — VS Code fork with AI-native editing and inline chat.

## Evidence Gate

Implement this adapter when:
- Cursor exposes a stable `.cursorrules` or equivalent file format (confirmed supported)
- Cursor has hook events equivalent to CC PreToolUse/PostToolUse/Stop; OR
- Cursor usage at Lifetrenz is confirmed (≥1 engineer using it regularly)

## Planned Adapter Scope (when activated)

1. Install `.cursorrules` from `shared/contract.md` kernel
2. Copy `shared/standards/` into `.cursor/ai-platform/standards/`
3. Copy `shared/rules/` into `.cursor/ai-platform/rules/`
4. Expose commands as Cursor custom prompts (if Cursor supports a prompt file format)
5. Audit logging: unsupported until Cursor exposes a hook API

## Files to Create (when activated)

See `file-map.yml` for source → destination mapping.
