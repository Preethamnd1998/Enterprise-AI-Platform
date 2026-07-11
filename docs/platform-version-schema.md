# Platform Version Schema — `.ai/.platform-version.json`
**Status:** ✅ Defined — TK-008 complete, BLK-04 CLOSED  
**Date:** 2026-07-07  

---

## Purpose
`.ai/.platform-version.json` is written by the installer into each consuming repo. It records what version of the platform is installed, which adapter(s) are active, and which optional features have been successfully enabled. CI reads this file to detect drift and enforce minimum version requirements.

---

## Schema (JSON)

```json
{
  "$schema": "https://json.schemastore.org/enterprise-ai-platform-version.json",
  "version": "3.1.0",
  "installedAt": "2026-07-07T10:00:00Z",
  "channel": "stable",
  "platforms": {
    "claude": {
      "installed": true,
      "adapterVersion": "1.0.0",
      "settingsHash": "<sha256-of-.claude/settings.json>"
    },
    "copilot": {
      "installed": false,
      "adapterVersion": null,
      "settingsHash": null
    },
    "opencode": {
      "installed": false,
      "adapterVersion": null,
      "settingsHash": null
    }
  },
  "features": {
    "mcp-allowlist": false,
    "hash-check-hook": false,
    "audit-hook": false,
    "drift-gate-ci": false,
    "command-registry": false,
    "test-command": false,
    "prompt-audit": false,
    "opencode-adapter": false,
    "agent-subagent-limit": false
  },
  "contractHash": "<sha256-of-injected-contract-section-in-.claude/CLAUDE.md>",
  "standardsHashes": {
    "coding-standards.md": "<sha256>",
    "backend/controller.md": "<sha256>",
    "backend/service.md": "<sha256>",
    "mobile/widget.md": "<sha256>"
  }
}
```

---

## Field Definitions

### Top-level

| Field | Type | Description |
|---|---|---|
| `version` | string (semver) | Platform version installed (e.g. `"3.1.0"`) |
| `installedAt` | string (ISO 8601) | Timestamp when installer last ran |
| `channel` | `"stable"` \| `"rc"` \| `"dev"` | Release channel; default `"stable"` |

### `platforms`

One entry per supported adapter. `installed: false` means the adapter was not installed (not an error — repo may only need Claude adapter).

| Field | Type | Description |
|---|---|---|
| `installed` | boolean | Whether this adapter's install completed successfully |
| `adapterVersion` | string \| null | Version of the adapter module |
| `settingsHash` | string \| null | SHA-256 of the installed adapter config file |

### `features`

Each feature is a boolean flag. Defaults to `false`. Installer sets to `true` ONLY after the corresponding installation step completes successfully. Rollback = set flag back to `false` and re-run installer.

| Feature key | Set `true` when |
|---|---|
| `mcp-allowlist` | `settings.json` written with allowlist pattern (Phase A, Sprint 1) |
| `hash-check-hook` | `PreToolUse` hash-check hook installed and `.ai/.contract-hash` written (Phase A) |
| `audit-hook` | `Stop` hook running `audit.js` is installed (Phase A) |
| `drift-gate-ci` | `ci/ai-platform-drift.gitlab-ci.yml` included and verified (Phase A) |
| `command-registry` | `shared/commands/registry.yml` written and `.claude/commands/` populated (Phase B) |
| `test-command` | `/test` command built and installed (Phase C) |
| `prompt-audit` | `/prompt-audit` command built and installed (Phase C) |
| `opencode-adapter` | OpenCode adapter installed (Phase C) |
| `agent-subagent-limit` | Subagent limit enforcement hook installed (Phase D) |

### `contractHash` and `standardsHashes`

Written by installer at install time. `PreToolUse` hook reads `.ai/.contract-hash` (same value as `contractHash` above). CI drift gate reads `.ai/.standards-hash` (derived from `standardsHashes`).

---

## Installer Logic (pseudocode)

```
version = read_current_platform_version()
record = read_existing_platform_version_json() OR new_empty_record()

record.version = version
record.installedAt = now()

if install_claude_adapter() succeeds:
  record.platforms.claude.installed = true
  record.platforms.claude.adapterVersion = adapter_version()
  record.platforms.claude.settingsHash = sha256(settings_json)

if write_mcp_allowlist() succeeds:
  record.features["mcp-allowlist"] = true

if write_hash_check_hook() succeeds:
  record.contractHash = sha256(contract_section)
  write_file(".ai/.contract-hash", record.contractHash)
  record.features["hash-check-hook"] = true

write_file(".ai/.platform-version.json", json_encode(record))
```

Key rule: **never set a feature flag true optimistically** — only after the step that enables it succeeds. If the step fails, the flag stays false and the installer prints an actionable error.

---

## gitignore
`.ai/.platform-version.json` is **NOT gitignored** — it is tracked per-repo so PRs show version updates.

`.ai/.session-verified` and `.ai/.contract-hash` and `.ai/.standards-hash` ARE gitignored.

### Recommended `.gitignore` additions:
```gitignore
# AI Platform — runtime-only
.ai/.session-verified
.ai/.contract-hash
.ai/.standards-hash

# AI Platform — tracked
# (do NOT gitignore .ai/.platform-version.json)
```

---

## CI Drift Check (reads this file)

```powershell
# tools/check-drift.ps1 (excerpt)
$record = Get-Content ".ai/.platform-version.json" | ConvertFrom-Json
$minVersion = "3.1.0"
if ([version]$record.version -lt [version]$minVersion) {
    Write-Error "Platform version $($record.version) < minimum $minVersion. Run install-claude.ps1."
    exit 1
}
# Check each feature required for this branch
$required = @("mcp-allowlist", "hash-check-hook", "drift-gate-ci")
foreach ($feat in $required) {
    if (-not $record.features.$feat) {
        Write-Error "Feature '$feat' not installed. Re-run install-claude.ps1."
        exit 1
    }
}
Write-Host "Platform drift check PASSED. Version: $($record.version)"
```

---

## Blockers Closed
- **BLK-04**: Closed. Feature-flag mechanism defined in `.platform-version.features{}`.

## Board Updates Required
- BLK-04: CLOSED
- BUG-A1 (V-A3): CLOSED
- FT-003: Unblocked
