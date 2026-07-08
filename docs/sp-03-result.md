# SP-03 Result — OpenCode Plugin/Event API
**Status:** CLOSED  
**Date:** 2026-07-07 (TK-084)  
**Feature:** FT-062 (OC observability), EP-15 (Observability)  

---

## Question
What events does OpenCode expose? How is a plugin registered? Does the handler receive
tool call data? Is the event system sufficient for session summary and audit observability?

## Investigation

### OpenCode architecture (as of 2025–2026)

OpenCode is a terminal-based AI coding assistant with:
- `.opencode/` directory for project configuration
- `opencode.json` for global/project settings (model, MCP servers, keybindings)
- `.opencode/command/*.md` files for custom commands
- No formal plugin/extension API
- No hook events equivalent to Claude Code's PreToolUse / PostToolUse / Stop

### Event system assessment

| Feature | Claude Code | OpenCode |
|---|---|---|
| PreToolUse hook | ✅ | ❌ Not available |
| PostToolUse hook | ✅ | ❌ Not available |
| Stop/session-end hook | ✅ | ❌ Not available |
| Custom commands | ✅ (.claude/commands/) | ✅ (.opencode/command/*.md) |
| MCP support | ✅ | ✅ (mcpServers in opencode.json) |
| JSONL session transcript | ✅ | ❌ No equivalent |

### Conclusion

OpenCode **does not expose a plugin/event API** sufficient for audit observability.
- No hook to fire before or after tool calls
- No session-end event
- No transcript path exposed to external scripts
- The only extensibility point is custom commands (read-only prompts)

## Decision

**Cap 24/35 (observability) is UNSUPPORTED on OpenCode.** This aligns with ADR-14
(OpenCode as first-class platform) but with degraded capabilities acknowledged in
`adapters/opencode/capability-map.yml`.

**Mitigation:** The platform audit log (`.claude/audit/log.jsonl`) is Claude Code only.
OC sessions are not audited by the platform. This is documented and acceptable for Phase C.

## Impact

- FT-062 (OC observability) status: **UNSUPPORTED** — capability-map.yml cap-15 = unsupported
- EP-15 (Observability) for OC: deferred to Phase E or later, evidence-gated
- OC adapter ships with commands + AGENTS.md + install.ps1 only (no hooks)
- SP-03 CLOSED: BLK for FT-062 lifted with "unsupported" resolution

## Capability matrix update
`adapters/opencode/capability-map.yml` cap-15 (audit log) = unsupported.
No mitigation beyond documentation.

## Phase D (v4.1) — FT-062 disposition (US-046)
**Decision date:** 2026-07-07  
FT-062 (OC plugin/event wiring for observability) was assessed again in Sprint 4 Phase D.
The conclusion from SP-03 holds — no hook API exists in OpenCode and none is planned upstream.

**FT-062 status: DEFERRED to Phase E+**, evidence-gated by usage telemetry (US-048).
Activation criteria: if OC adoption >30% of sessions by Phase E review, investigate
alternative observability approaches (e.g. wrapper script, external log monitor).
Until that threshold is met, OC observability remains unsupported and unmitigated.

No implementation was attempted in Phase D. This is the intended outcome per EP-06 scope.
