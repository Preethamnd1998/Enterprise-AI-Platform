# Continue Adapter — STUB (Phase F / FT-082)
<!-- adapters/continue/STUB.md — Future adapter skeleton. Not yet implemented.
     Evidence gate: Continue.dev has a documented config API that may support rules injection.
     See capability-map.yml for current known capabilities. -->

## Status

STUB — not implemented. Activation requires evidence gate (see below).

## Platform

[Continue](https://continue.dev/) — open-source AI code assistant; VS Code + JetBrains extension.

## Evidence Gate

Implement this adapter when:
- Continue `.continuerc.json` or `config.ts` supports system prompt / rules injection
- Continue usage at Lifetrenz is confirmed (≥1 engineer using it regularly)

## Planned Adapter Scope (when activated)

1. Inject contract kernel as system prompt via Continue `config.ts` `systemMessage` field
2. Copy standards and rules under `.continue/ai-platform/`
3. Expose commands as Continue slash commands via `customCommands` config array
4. Audit logging: unsupported until Continue exposes a hook API

## Files to Create (when activated)

See `file-map.yml` for source → destination mapping.
