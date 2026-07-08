# V-C3 Result — GitLab MCP: Official vs Custom Decision
**Status:** CLOSED  
**Date:** 2026-07-07 (TK-058)  
**Feature closed:** FT-086, FT-037  

---

## Question
Should the platform use the **official GitLab MCP server** (provided by GitLab Inc.) or
the **custom `mcp__gitlab-reader`** already deployed at Lifetrenz?

## Comparison

| Criterion | Official GitLab MCP | Custom mcp__gitlab-reader |
|---|---|---|
| Already deployed | ❌ Would require new setup | ✅ Running in production |
| Already in allowlist | ❌ Different tool naming | ✅ 13 tools in allowlist (Sprint 1) |
| Tool naming convention | `mcp__gitlab__*` | `mcp__gitlab-reader__*` |
| Read-only server | Depends on config | ✅ Designed read-only (no write tools) |
| Self-hosted GitLab support | Limited | ✅ Confirmed working with self-hosted |
| Audit trail | None | ✅ Logs tool calls |
| Breaking change if switched | — | Settings.json allowlist would need update |

## Decision: Keep custom `mcp__gitlab-reader`

**Rationale:**
1. It is already deployed and confirmed working (`mcp__gitlab-reader` in 24-tool allowlist)
2. Moving to official server would require rewriting the entire 24-entry allowlist
3. Custom server is read-only by design — official server requires read-only config
4. The naming convention (`mcp__gitlab-reader__*`) is already standardized in `shared/mcp/tool-allowlists.md`

**Not switching to official GitLab MCP.** Architecture frozen — no new MCP servers unless a
blocking functional gap requires it.

## Impact

- `shared/mcp/.mcp.json.template` uses the custom server entry for `"gitlab-reader"`
- `docs/mcp-setup.md` documents setup steps for the custom server
- Capability matrix cap-07 (read_repository) remains ✅ supported via custom server
- FT-037 CLOSED: GitLab MCP setup decision applied
- V-C3 BUG CLOSED

## Action items from this spike

1. ✅ `.mcp.json.template` already written with custom server entry (TK-055)
2. ➡ Update `docs/mcp-setup.md` with custom server install instructions (TK-059)
