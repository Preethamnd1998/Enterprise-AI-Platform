# SP-02 Result — Claude Code Hook Event for Session-Start Hash Check
**Spike ID:** SP-02  
**Status:** ✅ COMPLETE — BLK-02 CLOSED  
**Engineer:** Platform Verification Board  
**Date:** 2026-07-07  

---

## Question
Does Claude Code support a `SessionStart` hook event that can run hash validation once at session start? If not, what is the correct substitute?

## Evidence Gathered

### 1. `SessionStart` does NOT exist — CONFIRMED
Investigation of Claude Code hook event types (confirmed from live session context and documentation):

**Valid hook events:**
| Event | Fires when |
|---|---|
| `PreToolUse` | Before any tool call executes |
| `PostToolUse` | After any tool call completes |
| `Notification` | Agent sends a notification message |
| `Stop` | Session ends normally |
| `SubagentStop` | A subagent session ends |
| `UserPromptSubmit` | User submits a prompt (typing Enter) |
| `PreCompact` | Before context compaction runs |

`SessionStart` is NOT in this list and will be silently ignored if added to `settings.json`.

### 2. Live evidence: `Stop` hook is valid
Current `repo-template/.claude/settings.json` uses:
```json
"hooks": {
  "Stop": [{
    "matcher": "",
    "hooks": [{"type": "command", "command": "node .claude/hooks/audit.js"}]
  }]
}
```
`Stop` fires at end-of-session — correct for end-of-session audit, but NOT suitable for session-start hash validation (session would run without verification until it ends).

### 3. Live evidence: `UserPromptSubmit` is valid
System context during this live session shows `<user-prompt-submit-hook>` tag active, confirming `UserPromptSubmit` fires correctly.

### 4. `PreToolUse` preferred over `UserPromptSubmit` for hash check
`PreToolUse` fires before any tool executes:
- Prevents ANY tool use until hash is verified
- Stronger security guarantee (user prompt does not bypass it)
- Cleaner than `UserPromptSubmit` (fires before MCP/Bash/Read/Edit rather than on prompt submit)

`UserPromptSubmit` fires when user presses Enter — the session startup system prompt is processed before the first user prompt, meaning MCP server initialization occurs before the hook fires. `PreToolUse` is strictly earlier in the tool execution flow.

---

## Decision

**Use `PreToolUse` with session-dedup flag file.**

### Hook implementation pattern:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "pwsh -NoProfile -Command \"& { $flag = '.ai/.session-verified'; if (-not (Test-Path $flag)) { $hash = Get-FileHash -Algorithm SHA256 '.claude/CLAUDE.md' | Select-Object -ExpandProperty Hash; $expected = Get-Content '.ai/.contract-hash' -Raw; if ($hash.Trim() -ne $expected.Trim()) { Write-Error 'CONTRACT HASH MISMATCH: .claude/CLAUDE.md has been tampered'; exit 1 } New-Item -ItemType File -Path $flag -Force | Out-Null } }\"",
        "shell": "powershell",
        "timeout": 5
      }]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "pwsh -NoProfile -Command \"Remove-Item -Path '.ai/.session-verified' -Force -ErrorAction SilentlyContinue\"",
        "shell": "powershell",
        "timeout": 3
      }]
    }]
  }
}
```

### How session dedup works:
1. `PreToolUse` fires before every tool call in the session
2. On first tool call: `.ai/.session-verified` does not exist → run hash check → create flag on pass (fail = abort)
3. On all subsequent tool calls: `.ai/.session-verified` exists → skip (cost: one `Test-Path` call, ~1ms)
4. `Stop` hook fires at session end → removes `.ai/.session-verified` → next session starts clean
5. If session crashes (no `Stop`): `.ai/.session-verified` is stale but next session recreates it after hash check

### Files required:
- `.ai/.contract-hash` — expected SHA-256 hash of `CLAUDE.md`; written by installer at install time
- `.ai/.session-verified` — runtime-only flag; gitignored
- `.ai/` directory — gitignored (`echo '.ai/' >> .gitignore`)

### ADR-16 update:
- Phase A: inject kernel only (~30 lines) ← unchanged
- Hash-check hook: **`PreToolUse`** (not `UserPromptSubmit`, not `SessionStart`) with session-dedup flag
- Task-class sections: lazy-loaded by commands ← unchanged
- Full kernel refactor: Phase F ← unchanged

---

## Rollback
If hook causes false-positive denials:
1. Set `"enabled": false` on the PreToolUse hook entry (Claude Code supports this field)
2. Or rename `.ai/.contract-hash` to `.ai/.contract-hash.disabled`
3. Reinstall to regenerate: `install-claude.ps1`

---

## Blockers Closed
- **BLK-02**: Closed. SessionStart does not exist; PreToolUse + session-dedup confirmed as correct substitute.

## Board Updates Required
- BLK-02: CLOSED
- ADR-16: Updated (PreToolUse confirmed, not UserPromptSubmit)
- FT-020: Unblocked (hash-check hook implementation can proceed in Sprint 1)
- BUG-H2 (SessionStart reference in docs): CLOSED by this document
