# Rollback Procedures (V-G1)
**Status:** Phase A baseline  
**Date:** 2026-07-07 (TK-050)  

---

## Overview

Every installer action creates a `.prev` backup before overwriting any file. All platform-managed files can be restored from these backups. For git-tracked files, `git reset --hard` to the pre-install commit is always an option.

---

## Scenario 1: Roll back MCP allowlist (settings.json)

**When:** The allowlist blocks a read tool you need; or the settings.json was incorrectly written.

```powershell
# Option A: Restore from .prev backup
Copy-Item .claude/settings.json.prev .claude/settings.json -Force
Write-Host "Restored .claude/settings.json from .prev backup"

# Option B: Add the missing tool to allow array manually
# Edit .claude/settings.json, add the tool name to "allow": []

# Option C: Re-run installer with original template
pwsh adapters/claude/install.ps1 -RepoPath . -Force
```

**Verify:** Open a new CC session and attempt the previously-failing tool. If still blocked, the tool name may be different from what was added to `allow`.

---

## Scenario 2: Roll back contract kernel injection

**When:** The contract kernel injection corrupted `.claude/CLAUDE.md` or overwrote custom module boundaries.

```powershell
# Restore from .prev backup
Copy-Item .claude/CLAUDE.md.prev .claude/CLAUDE.md -Force
Write-Host "Restored .claude/CLAUDE.md from .prev"

# Update .ai/.contract-hash to match restored file
# (or remove it — hook will warn but not block)
Remove-Item .ai/.contract-hash -ErrorAction SilentlyContinue
```

**Verify:** Content outside the `enterprise-ai-platform:contract:start/end` markers is preserved.

---

## Scenario 3: Roll back hash-check hook (false positive re-injection)

**When:** `hash-check.js` re-injected the contract kernel when it should not have.

```powershell
# Restore CLAUDE.md (created before re-injection)
Copy-Item .claude/CLAUDE.md.prev .claude/CLAUDE.md -Force

# Option: update the stored hash to match the current CLAUDE.md
# (if you intentionally modified the contract for this repo)
$content = Get-Content .claude/CLAUDE.md -Raw
$start   = "<!-- enterprise-ai-platform:kernel:start -->"
$end     = "<!-- enterprise-ai-platform:kernel:end -->"
$si = $content.IndexOf($start)
$ei = $content.IndexOf($end)
$kernel = $content.Substring($si, $ei - $si + $end.Length)
$bytes  = [System.Text.Encoding]::UTF8.GetBytes($kernel)
$sha    = [System.Security.Cryptography.SHA256]::Create()
$hash   = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
Set-Content .ai/.contract-hash $hash -NoNewline -Encoding utf8
Write-Host "Updated .ai/.contract-hash to match current CLAUDE.md: $hash"
```

---

## Scenario 4: Roll back feature flag

**When:** A feature flag was incorrectly set to `true`; or a feature needs to be disabled.

```powershell
$pvPath = ".ai/.platform-version.json"
$pv = Get-Content $pvPath | ConvertFrom-Json

# Convert to hashtable for mutation
$rec      = @{}
$pv.PSObject.Properties | ForEach-Object { $rec[$_.Name] = $_.Value }
$features = @{}
$pv.features.PSObject.Properties | ForEach-Object { $features[$_.Name] = $_.Value }

# Set feature to false
$features["mcp-allowlist"] = $false  # replace with the feature you want to disable

$rec["features"] = $features
$rec | ConvertTo-Json -Depth 5 | Set-Content $pvPath -Encoding utf8
Write-Host "Feature flag updated in .ai/.platform-version.json"
```

---

## Scenario 5: Roll back legacy hook de-register (upgrade.ps1)

**When:** `upgrade.ps1` removed a hook that was still needed; or you want to restore the original settings.

```powershell
# Restore from .prev backup
$globalSettings = Join-Path $env:USERPROFILE ".claude\settings.json"
Copy-Item "$globalSettings.prev" $globalSettings -Force
Write-Host "Restored ~/.claude/settings.json from .prev backup"
```

---

## Scenario 6: Full platform uninstall

**When:** You want to completely remove the platform from a repo and the global install.

```powershell
# Per-repo: remove .claude/ additions
Remove-Item -Recurse -Force .claude/hooks/audit.js .claude/hooks/hash-check.js -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .claude/audit/ -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .ai/ -ErrorAction SilentlyContinue

# Per-repo: restore .claude/settings.json to pre-platform state
Copy-Item .claude/settings.json.prev .claude/settings.json -ErrorAction SilentlyContinue

# Global: remove standards and commands
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\standards\" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\commands\"  -ErrorAction SilentlyContinue

# Global: remove contract from CLAUDE.md (between markers)
$claudeMd = "$env:USERPROFILE\.claude\CLAUDE.md"
if (Test-Path $claudeMd) {
  $content = Get-Content $claudeMd -Raw
  $start   = "<!-- enterprise-ai-platform:contract:start -->"
  $end     = "<!-- enterprise-ai-platform:contract:end -->"
  $pattern = '(?s)' + [regex]::Escape($start) + '.*?' + [regex]::Escape($end)
  $cleaned = $content -replace $pattern, ''
  Set-Content $claudeMd $cleaned.Trim() -Encoding utf8
  Write-Host "Removed contract from ~/.claude/CLAUDE.md"
}
```

---

## Scenario 7: Roll back .mcp.json (V-G2)

**When:** `.mcp.json` was incorrectly written, or an MCP server is misbehaving and must be
temporarily disabled.

```powershell
# Option A: Restore from .prev backup
Copy-Item .mcp.json.prev .mcp.json -Force
Write-Host "Restored .mcp.json from .prev backup"

# Option B: Remove .mcp.json entirely (disables all project-level MCP)
Remove-Item .mcp.json -ErrorAction SilentlyContinue
Write-Host "Removed .mcp.json — MCP servers will fall back to ~/.claude/mcp.json (global)"

# Option C: Disable a single server by editing .mcp.json
# Comment out or remove the server block for the problematic server
```

**PAT rollback (if token was leaked):**
```powershell
# 1. Rotate the token immediately in the external service (GitLab/Redmine/DB)
# 2. Update your shell profile with the new token
# 3. No file rollback needed — .mcp.json uses ${env:} injection, not literals
```

**Verify:** Open a new Claude Code session and confirm the MCP server is no longer available
(or working, if you updated the token).

---

## Scenario 8: Roll back Copilot adapter install

**When:** The Copilot install corrupted `.github/copilot-instructions.md` or overwrote
custom content outside the markers.

```powershell
# Restore from .prev backup
Copy-Item .github/copilot-instructions.md.prev .github/copilot-instructions.md -Force
Write-Host "Restored .github/copilot-instructions.md from .prev"

# Re-run installer to get correct content (use -Force to overwrite again cleanly)
pwsh adapters/copilot/install.ps1 -RepoPath . -Force
```

---

## Scenario 9: Roll back OpenCode adapter install

**When:** The OpenCode install corrupted `AGENTS.md` or overwrote custom content outside
the markers, or `.opencode/command/` shells are incorrect.

```powershell
# Option A: Restore AGENTS.md from .prev backup
Copy-Item AGENTS.md.prev AGENTS.md -Force
Write-Host "Restored AGENTS.md from .prev backup"

# Option B: Restore all OC files from git
git checkout HEAD -- AGENTS.md
git checkout HEAD -- .opencode/

# Option C: Re-run installer with -Force to get a clean install
pwsh adapters/opencode/install.ps1 -RepoPath . -Force
```

**Verify:** Open an OpenCode session and confirm the contract instructions appear correctly
in the session context. Run `/bug-fix` — the agent should read the correct command definition.

**SP-03 note:** OpenCode has no hook API; no `audit.js` is installed, so there is no audit
log to restore. The only OC-specific files are: `AGENTS.md`, `.opencode/command/*.md`,
`.opencode/ai-platform/`, and `.opencode/ai-platform/.platform-version.json`.

---

## Scenario 10: Roll back Phase D changes (rules/, /ai/ templates, pre-flight, audit.js PostToolUse)

**When:** A Phase D deliverable (rules/ files, /ai/ templates, pre-flight block in contract,
or audit.js PostToolUse changes) causes unexpected behavior.

### Roll back contract.md changes (rules reference + pre-flight block)
```powershell
# Restore from git (the contract change is minimal and specific)
git checkout HEAD~1 -- shared/contract.md

# Recompute hash after restoring
pwsh tools/compute-contract-hash.ps1
```

### Roll back audit.js PostToolUse hook
```powershell
# Remove PostToolUse hook from settings.json (revert to Stop-only)
# Edit .claude/settings.json: delete the "PostToolUse" hook block
# The Stop hook continues to write audit entries without PostToolUse

# To fully disable PostToolUse auditing without modifying settings.json,
# add an early-exit guard at the top of audit.js for PostToolUse events.
```

### Roll back /ai/ templates
```powershell
# Templates are new files — simply remove them from shared/templates/ai/
Remove-Item shared/templates/ai/ -Recurse -Force
```

### Roll back rules/ files
```powershell
# Rules files are new files — remove the directory
Remove-Item shared/rules/ -Recurse -Force
# The contract references will now point to non-existent files; restore the
# pre-Phase-D contract.md to remove the lazy rules loading references.
```

**Verify:** Open a new Claude Code session. Confirm no errors from audit.js.
Check `.claude/audit/log.jsonl` — entries should still be written without PostToolUse.

---

## Scenario 11: Roll back Phase E changes (audit schema v1.1, GOVERNANCE.md, contract §17)

**When:** Phase E changes cause unexpected behaviour in audit logging, governance flow,
or contract enforcement.

### Roll back audit.js to schema v1.0 (remove telemetry fields)
```powershell
# Option A: restore from git
git checkout HEAD~1 -- adapters/claude/hooks/audit.js
git checkout HEAD~1 -- shared/schemas/audit-schema.json

# Option B: manually revert SCHEMA_VERSION in audit.js from "1.1" to "1.0"
# and remove the five telemetry fields from the entry object
```

**Note:** Existing log entries with schema_version "1.1" remain in log.jsonl and are valid
against the v1.0 schema EXCEPT for the five new top-level fields, which would fail validation.
If strict v1.0 validation is required, archive the v1.1 entries first.

### Roll back contract §17 (pause-turn cap)
```powershell
# Restore contract + hash from git
git checkout HEAD~1 -- shared/contract.md
git checkout HEAD~1 -- shared/contract.md.sha256
```

### Roll back GOVERNANCE.md
```powershell
# GOVERNANCE.md is a new file — simply remove it
Remove-Item GOVERNANCE.md
```

### Roll back docs
```powershell
# New docs only — remove if needed
Remove-Item docs/hitl-matrix.md
Remove-Item docs/copilot-measurement.md
```

**Verify:** Open a new Claude Code session. Check `.claude/audit/log.jsonl` for valid entries.
Confirm schema_version in new entries matches the restored version.

---

## Scenario 12: Roll back Phase F changes (contract lazy refactor, company-profile seam, rollout tooling, adapter stubs)

**When:** Phase F changes cause unexpected behaviour in session loading, rollout scripts, or adapter discovery.

### Roll back §15/§16 lazy refactor (US-052 — F11)
```powershell
# Option A: restore from git
git checkout HEAD~N -- shared/contract.md
git checkout HEAD~N -- shared/contract.md.sha256
# Then remove the externalized files (optional — they are harmless if they remain)
Remove-Item shared/commands/migration-intelligence.md
Remove-Item shared/prompts/prompt-quality.md
```
**Note:** kernel hash unchanged — HEAD~N may resolve to the Phase E commit. Confirm hash before restoring.

### Roll back company-profile seam (US-053 — F10 partial)
```powershell
# Remove the new file
Remove-Item shared/company-profile.md
# Restore contract §5 (removes 2-line company-profile reference)
git checkout HEAD~N -- shared/contract.md
```

### Roll back rollout-fleet.ps1 and repos.txt (US-054/US-055/US-056)
```powershell
# Remove tooling files — no consuming repo is affected (fleet MRs are separate commits)
Remove-Item tools/rollout-fleet.ps1
Remove-Item tools/repos.txt
Remove-Item docs/fleet-rollout.md
```
**Note:** If fleet MRs have already been merged into consuming repos, roll back each consuming repo individually using its own git history.

### Roll back future adapter stubs (US-057)
```powershell
# New directories only — remove if needed
Remove-Item adapters/cursor/ -Recurse -Force
Remove-Item adapters/windsurf/ -Recurse -Force
Remove-Item adapters/continue/ -Recurse -Force
Remove-Item adapters/cline/ -Recurse -Force
Remove-Item adapters/roo-code/ -Recurse -Force
```

**Verify:** Open a new Claude Code session. Confirm the contract §15/§16 stubs or full sections are present as expected. Check that `shared/company-profile.md` presence/absence matches the rollback target.

---

## Scenario 13: Roll back `install/bootstrap.sh` (machine-level, macOS/Linux)

**When:** You want to remove what `install/bootstrap.sh` set up on this
machine — its actions are additive and never touch unrelated config, so
this is about removing MCP registrations and PATH lines, not restoring a
backup.

### Remove the MCP server registrations
```bash
claude mcp remove unified-trace -s user
claude mcp remove opencode-bridge -s user
claude mcp remove code-cortex-mcp -s user
claude mcp remove knowledge-graph -s user
```
Run these from `$HOME` (or anywhere with no `.mcp.json` above it) — see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md)'s note on project-scope shadowing
for why running them from inside a project directory can silently target
the wrong scope.

### Remove the PATH line it added (only if it added one)
`install/bootstrap.sh` only appends to your shell profile if `claude` had
to be installed fresh; if `claude` was already on PATH, nothing was added.
If it did add a line, it's clearly marked:
```bash
grep -n "enterprise-ai-platform bootstrap" ~/.zprofile ~/.bash_profile ~/.bashrc ~/.profile 2>/dev/null
# then delete the marked block (the comment line plus the export line right after it)
```

### Remove the OpenCode config merge (only if it auto-merged)
If `install/bootstrap.sh` reported `OpenCode config merged` (not
`already configured` or `MANUAL_STEP_REQUIRED`), the `mcp`/`tools` keys it
added to `~/.config/opencode/opencode.jsonc` can be removed by hand — it's
plain JSON at that point (the merge only ever runs when the file has no
comments to lose), so any JSON-aware edit is safe.

### Sibling repo, Knowledge Graph database, autonomous-runner build
Bootstrap never deletes anything — `knowledge-graph-generator/` (which
also contains vendored Code Cortex at `code-cortex/`), the indexed
database, and `autonomous-runner/dist/` are ordinary git-tracked/build
directories. Remove them exactly as you would any other local
checkout/build output.

**Verify:** `bash install/bootstrap.sh --doctor` should report `[MISSING]`
for whichever servers you removed.

---

## General rollback guidance

- Every `.prev` file is created at install time and updated on each re-install.
- If `.prev` is missing, check `git log` for the last commit before the install.
- After any rollback, re-run `tools/check-drift.ps1` to confirm the platform state.
- The `Stop` hook audit log (`.claude/audit/log.jsonl`) records all sessions; use it to determine the pre-incident state.
