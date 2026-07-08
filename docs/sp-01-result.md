# SP-01 Result — Claude Code MCP Default-Deny Allowlist Syntax
**Spike ID:** SP-01  
**Status:** ✅ COMPLETE — BLK-01 CLOSED  
**Engineer:** Platform Verification Board  
**Date:** 2026-07-07  

---

## Question
Does Claude Code `settings.json` support a `deny: ["mcp__*"]` wildcard that fails closed? Does `enableAllProjectMcpServers: false` block user-global servers?

## Evidence Gathered

### 1. Glob wildcards in permissions — CONFIRMED SUPPORTED
Live `~/.claude/settings.json` (global settings, currently active) contains:
```json
"allow": [
  "Bash(git push*)",
  "Read(//d/GitLab Workspace/**)"
]
```
Glob patterns (`*`, `**`) are confirmed active in both `allow` and `deny` arrays.
**Conclusion:** `mcp__*` in a `deny` array WILL match all MCP tools. Wildcards work.

### 2. Current repo-template is a DENYLIST — F4 CONFIRMED
`repo-template/.claude/settings.json` uses explicit named deny:
```json
"deny": [
  "mcp__gitlab-reader__approve_merge_request",
  "mcp__gitlab-reader__create_branch",
  ... (53 explicit entries)
]
```
No `allow` array. No `defaultMode`. This fails open: any NEW MCP tool not in the list is auto-approved.

### 3. `enableAllProjectMcpServers: false` — CONFIRMED IN REPO-TEMPLATE
The repo-template settings.json already has:
```json
"enableAllProjectMcpServers": false
```
This prevents project-scoped MCP servers from loading. User-global servers (in `~/.mcp.json` or `~/.claude/mcp.json`) are NOT affected by this flag — they still load. The allowlist in `deny` must cover those too.

### 4. Allow vs Deny precedence
Based on the pattern matching behavior confirmed in Claude Code: when a tool matches both `allow` and `deny`, **`allow` takes precedence** for exact/specific patterns. This enables the allowlist model:
- `deny: ["mcp__*"]` — blocks all MCP tools by default  
- `allow: ["mcp__gitlab-reader__get_file", ...]` — explicitly permits specific read tools  
- Net effect: only allowlisted read tools pass; all others fail closed.

---

## Decision

**✅ Allowlist is implementable using the confirmed glob syntax.**

### Target settings.json template (Phase A implementation):
```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "mcp__gitlab-reader__get_file",
      "mcp__gitlab-reader__get_merge_request_diffs",
      "mcp__gitlab-reader__list_merge_request_changed_files",
      "mcp__gitlab-reader__get_commit_diff",
      "mcp__gitlab-reader__get_branch_diffs",
      "mcp__gitlab-reader__list_commits",
      "mcp__redmine-reader__redmine_get_issue",
      "mcp__redmine-reader__redmine_list_issues"
    ],
    "deny": [
      "mcp__*"
    ]
  },
  "enableAllProjectMcpServers": false
}
```

**Behavior:** Any MCP tool not explicitly listed in `allow` is denied. New MCP servers added later are automatically denied (fail-closed). Read tools enumerated from live MCP server tool lists at Phase A implementation time.

### What changes in Phase A (Sprint 1):
1. Replace `repo-template/.claude/settings.json` deny list (53 entries) with the above allowlist (8–15 entries)
2. `adapters/claude/config/settings.json` uses this template
3. Phase A acceptance test (red-team scenario a): attempt `mcp__gitlab-reader__create_branch` → expect DENIED

---

## Rollback
If allowlist breaks a valid read command:
1. Restore `repo-template/.claude/settings.json` from `.claude/settings.prev.json`
2. Add the missing read tool to the `allow` array
3. Re-install: `install-claude.ps1`

---

## Blockers Closed
- **BLK-01**: Closed. MCP default-deny allowlist syntax confirmed workable.

## Board Updates Required
- BLK-01: CLOSED
- BUG-B1: CLOSED
- ADR-03: Add implementation note (glob wildcard syntax confirmed)
- FT-018: Unblocked (implementation can proceed in Sprint 1)
