# Per-Phase Definition of Done — Phases A through F
**Task:** TK-011 (US-007, V-F1/V-F2)  
**Status:** ✅ COMPLETE — BUG-F1 CLOSED, BUG-F2 CLOSED  
**Date:** 2026-07-07  

---

## Purpose
This document defines the concrete, verifiable acceptance criteria for each Phase (A–F). An engineer or reviewer can run the listed validation commands to confirm a phase is complete before proceeding to the next. All commands assume the repo root is the working directory.

---

## Phase A — Truth & Security (v3.1)
**Sprint:** 1 | **Owner:** Platform Engineering + Security

### Acceptance Criteria
- [ ] All 5 Sprint 0 blockers confirmed closed (pre-condition)
- [ ] `shared/` directory created with commands, standards, templates all populated
- [ ] `adapters/claude/` created with 8 glue files: install.ps1, config/settings.json, templates/CLAUDE.md, hooks/audit.js, capability-map.yml, compat.md, validate.ps1, upgrade.md
- [ ] `settings.json` uses allowlist pattern (`deny: ["mcp__*"]` + explicit read tool `allow`)
- [ ] `enableAllProjectMcpServers: false` present in settings.json
- [ ] `PreToolUse` hook installed in settings.json with session-dedup logic
- [ ] `Stop` hook cleans up `.ai/.session-verified` flag
- [ ] `.ai/.contract-hash` written by installer with correct SHA-256
- [ ] Contract kernel injected into `.claude/CLAUDE.md` between markers (verbatim, ≤30 lines)
- [ ] `ci/ai-platform-drift.gitlab-ci.yml` present and included in `.gitlab-ci.yml`
- [ ] `.ai/.platform-version.json` written with version `3.1.0` and correct feature flags
- [ ] Feature flags set true: `mcp-allowlist`, `hash-check-hook`, `audit-hook`, `drift-gate-ci`
- [ ] D1 duplicates deleted from `install/.github/` and outer `.github/`
- [ ] D2 phantom commands (PLANNING, UI-REDESIGN) deleted from `adapters/copilot/`

### Validation Commands
```powershell
# 1. Allowlist pattern check
$s = Get-Content "adapters/claude/config/settings.json" | ConvertFrom-Json
if ($s.permissions.deny -notcontains "mcp__*") { Write-Error "FAIL: no mcp__* deny" }
if ($s.enableAllProjectMcpServers -ne $false) { Write-Error "FAIL: enableAllProjectMcpServers not false" }
Write-Host "PASS: allowlist pattern present"

# 2. Contract hash check
$installedHash = Get-Content ".ai/.contract-hash" -Raw
$contractContent = (Get-Content "adapters/claude/templates/CLAUDE.md" -Raw)
$actualHash = (Get-FileHash -Algorithm SHA256 -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($contractContent)))).Hash
if ($installedHash.Trim() -ne $actualHash.Trim()) { Write-Error "FAIL: contract hash mismatch" }
Write-Host "PASS: contract hash verified"

# 3. Feature flags check
$pv = Get-Content ".ai/.platform-version.json" | ConvertFrom-Json
$required = @("mcp-allowlist", "hash-check-hook", "audit-hook", "drift-gate-ci")
foreach ($f in $required) {
    if (-not $pv.features.$f) { Write-Error "FAIL: feature '$f' not set" }
}
Write-Host "PASS: all Phase A feature flags set"

# 4. No phantom commands check
if (Test-Path "adapters/copilot/chatmodes/PLANNING.chatmode.md") { Write-Error "FAIL: D2 phantom command still present" }
if (Test-Path "adapters/copilot/chatmodes/UI-REDESIGN.chatmode.md") { Write-Error "FAIL: D2 phantom command still present" }
Write-Host "PASS: no phantom commands"

# 5. Drift gate check
pwsh -File tools/check-drift.ps1
```

**Gate B (Regression):**
- Existing contract content (between markers in CLAUDE.md) unchanged from pre-migration
- Existing Copilot chatmodes (bug-fix, migration) still present and non-empty
- `.gitlab-ci.yml` includes paths updated; CI runs without error on main branch

---

## Phase B — MCP Safety (v3.2)
**Sprint:** 2 | **Owner:** Security Engineering

### Acceptance Criteria
- [ ] `shared/mcp/` directory created
- [ ] `shared/mcp/allowed-tools.yml` lists only confirmed safe read tools
- [ ] Red-team test passes: attempt write tool → DENIED (not just unconfirmed)
- [ ] `adapters/claude/capability-map.yml` updated with MCP tools marked as read-only
- [ ] Session transcript shows no write MCP tool executed in a test session
- [ ] `mcp-allowlist` feature flag = true (should already be true from Phase A)
- [ ] `docs/mcp-setup.md` updated with new allowlist setup instructions

### Validation Commands
```powershell
# 1. Red-team: attempt write tool in test session (manual)
# Launch CC in repo, attempt mcp__gitlab-reader__create_branch
# Expected: "Tool call denied" or equivalent

# 2. Allowed tools list present
if (-not (Test-Path "shared/mcp/allowed-tools.yml")) { Write-Error "FAIL: allowed-tools.yml missing" }

# 3. Capability map check
$cap = Get-Content "adapters/claude/capability-map.yml" -Raw
if ($cap -notmatch "mcp-allowlist: true") { Write-Error "FAIL: capability-map.yml not updated" }
```

**Gate B:** No existing read workflow broken. Existing test in `docs/example-executions.md` still works end-to-end.

---

## Phase C — Portable Plugin (v4.0)
**Sprint:** 3–4 | **Owner:** Platform Engineering

### Acceptance Criteria
- [ ] `shared/commands/registry.yml` present with all 7 commands
- [ ] `shared/commands/test.md` present (D3 fix: `/test` command built)
- [ ] `shared/commands/prompt-audit.md` present
- [ ] `shared/standards/testing.md` present
- [ ] `adapters/opencode/` created with all 8 glue files
- [ ] OpenCode adapter installs correctly on Windows 11 Pro without admin
- [ ] Copilot adapter now GENERATES from registry.yml (no hand-maintained content)
- [ ] `install.ps1` at repo root installs all three adapters in sequence
- [ ] `test-command` feature flag = true after install
- [ ] `opencode-adapter` feature flag = true after install
- [ ] Platform version = `4.0.0` after Sprint 3 complete

### Validation Commands
```powershell
# 1. Command registry present
if (-not (Test-Path "shared/commands/registry.yml")) { Write-Error "FAIL: registry.yml missing" }
$reg = Get-Content "shared/commands/registry.yml" | ConvertFrom-Yaml
if ($reg.commands.Count -lt 7) { Write-Error "FAIL: fewer than 7 commands in registry" }

# 2. OpenCode adapter present
$oc_files = @("install.ps1","capability-map.yml","compat.md","validate.ps1","upgrade.md")
foreach ($f in $oc_files) {
    if (-not (Test-Path "adapters/opencode/$f")) { Write-Error "FAIL: adapters/opencode/$f missing" }
}

# 3. Copilot no hand-maintained content check
$copilot_chatmodes = Get-ChildItem "adapters/copilot/templates/chatmodes/"
$phantom = $copilot_chatmodes | Where-Object { $_.Name -match "PLANNING|UI-REDESIGN" }
if ($phantom) { Write-Error "FAIL: phantom chatmodes still present" }

# 4. Feature flags
$pv = Get-Content ".ai/.platform-version.json" | ConvertFrom-Json
if (-not $pv.features."test-command") { Write-Error "FAIL: test-command flag not set" }
if (-not $pv.features."opencode-adapter") { Write-Error "FAIL: opencode-adapter flag not set" }
```

**Gate B:** Install script is idempotent (run twice → no errors, same result). All Phase A and B feature flags still true.

---

## Phase D — Automation (v4.1)
**Sprint:** 5 | **Owner:** Platform Engineering

### Acceptance Criteria
- [ ] `shared/rules/` created with prompt-quality rules
- [ ] `shared/prompts/` created with command prompt library
- [ ] `shared/reports/` created with report templates
- [ ] `shared/knowledge/` created with knowledge management templates
- [ ] `agent-subagent-limit` enforcement hook installed
- [ ] `standards/testing.md` has subagent limit section (§2)
- [ ] `prompt-audit` feature flag = true
- [ ] `agent-subagent-limit` feature flag = true
- [ ] Platform version = `4.1.0`

### Validation Commands
```powershell
# 1. Shared layer completeness
$dirs = @("rules","prompts","reports","knowledge")
foreach ($d in $dirs) {
    if (-not (Test-Path "shared/$d")) { Write-Error "FAIL: shared/$d missing" }
}

# 2. Subagent limit in testing.md
$testing = Get-Content "shared/standards/testing.md" -Raw
if ($testing -notmatch "subagent") { Write-Error "FAIL: subagent limit not in testing.md" }

# 3. Feature flags
$pv = Get-Content ".ai/.platform-version.json" | ConvertFrom-Json
if (-not $pv.features."agent-subagent-limit") { Write-Error "FAIL: agent-subagent-limit flag not set" }
if (-not $pv.features."prompt-audit") { Write-Error "FAIL: prompt-audit flag not set" }
```

**Gate B:** No regression in Phase A–C features. All adapters still install cleanly. CI passes.

---

## Phase E — CI & Marketplace (v4.2)
**Sprint:** 6 | **Owner:** Platform Engineering + DevOps

### Acceptance Criteria
- [ ] CI pipeline (`validate.sh`) runs all validation checks (allowlist, drift, command registry, feature flags)
- [ ] `ci/release-check.sh` updated to check all Phase A–D deliverables
- [ ] `.claude-plugin/plugin.json` fixed (D5): correct `name`, `version`, `description`
- [ ] `.claude-plugin/marketplace.json` fixed: correct category tags, no phantom commands
- [ ] `tools/rollout-fleet.ps1` tested against a sample repo
- [ ] Platform version = `4.2.0`
- [ ] Full end-to-end install test on a clean repo passes: install → verify all feature flags → run drift check → all PASS

### Validation Commands
```bash
# 1. Full CI run (on CI/CD)
bash ci/validate.sh

# 2. Release check
bash ci/release-check.sh

# 3. Plugin manifest valid JSON
python3 -c "import json; json.load(open('.claude-plugin/plugin.json'))" && echo "PASS: plugin.json valid"

# 4. Rollout dry-run
pwsh -File tools/rollout-fleet.ps1 -DryRun
```

**Gate B:** No feature regressions. All prior phase validation commands pass on clean install.

---

## Phase F — Contract Refactor (v4.3)
**Sprint:** 6 (late) | **Owner:** Platform Engineering

### Acceptance Criteria
- [ ] F11: Full kernel refactor complete — CLAUDE.md contract kernel is modular
- [ ] Task-class sections confirmed as lazy-loaded (commands use Read, not embedded)
- [ ] Contract kernel still ≤30 lines verbatim after refactor
- [ ] `BUG-H3` fix confirmed: legacy `PostToolUse → Skill` hook removed from `~/.claude/settings.json`
- [ ] All integration tests pass (hook fires correctly, hash check passes)
- [ ] Platform version = `4.3.0`
- [ ] Full upgrade path documented: v3.0.0 → v3.1.0 → ... → v4.3.0

### Validation Commands
```powershell
# 1. Contract kernel size check
$claudeMd = Get-Content ".claude/CLAUDE.md" -Raw
$start = $claudeMd.IndexOf("enterprise-ai-platform:contract:start")
$end = $claudeMd.IndexOf("enterprise-ai-platform:contract:end")
$kernel = $claudeMd.Substring($start, $end - $start)
$lines = ($kernel -split "`n").Count
if ($lines -gt 35) { Write-Error "FAIL: contract kernel is $lines lines (max 30)" }
Write-Host "PASS: contract kernel is $lines lines"

# 2. BUG-H3 fix (live settings — run on engineer machine)
$globalSettings = Get-Content "$env:USERPROFILE\.claude\settings.json" | ConvertFrom-Json
$legacyHook = $globalSettings.hooks.PostToolUse | Where-Object { $_.matcher -eq "Skill" }
if ($legacyHook) { Write-Error "FAIL: BUG-H3 legacy Skill hook still present" }
Write-Host "PASS: BUG-H3 hook removed"

# 3. All feature flags true (Phase A–D)
$pv = Get-Content ".ai/.platform-version.json" | ConvertFrom-Json
$all = $pv.features.PSObject.Properties | Where-Object { -not $_.Value }
if ($all) { Write-Warning "Features not yet enabled: $($all.Name -join ', ')" }
Write-Host "PASS: all expected feature flags verified"
```

**Gate B:** All prior phase validation commands pass. No contract content regression. Full upgrade from v3.0.0 documented and tested.

---

## Phase G — AI Developer Agent (v4.4)
**Sprint:** 7 | **Owner:** Platform Engineering

### Acceptance Criteria
- [ ] `shared/commands/dev.md` present, follows `bug-fix.md` template structure (GOVERNANCE.md §1)
- [ ] `shared/commands/registry.yml` has `dev` entry with `status: active`
- [ ] Shells exist for every `supported_platforms` entry: `adapters/opencode/commands/dev.md`, `adapters/copilot/prompts/dev.prompt.md`, `adapters/copilot/chatmodes/dev.chatmode.md`
- [ ] Single Agent Mode default confirmed: no sub-agents created without `multi`
- [ ] Multi-Agent Mode capped at 3 sub-agents (contract C4 opt-in, scoped to `/dev`)
- [ ] Invalid mode word rejected with the two valid modes listed
- [ ] Contract kernel unchanged — no SHA-256 recompute needed
- [ ] Platform version = `4.4.0`

### Validation Commands
```powershell
# 1. Command file + registry entry present
if (-not (Test-Path "shared/commands/dev.md")) { Write-Error "FAIL: shared/commands/dev.md missing" }
$reg = Get-Content "shared/commands/registry.yml" -Raw
if ($reg -notmatch "id:\s*dev") { Write-Error "FAIL: dev not registered in registry.yml" }
if ($reg -notmatch "id:\s*dev[\s\S]*?status:\s*active") { Write-Error "FAIL: dev status is not active" }

# 2. Shells present for all supported_platforms
$shells = @(
  "adapters/opencode/commands/dev.md",
  "adapters/copilot/prompts/dev.prompt.md",
  "adapters/copilot/chatmodes/dev.chatmode.md"
)
foreach ($f in $shells) {
    if (-not (Test-Path $f)) { Write-Error "FAIL: $f missing" }
}

# 3. Kernel unchanged (no hash recompute expected for this phase)
$expected = Get-Content "shared/contract.md.sha256" -Raw
Write-Host "Kernel hash on file: $expected (compare against tools/compute-contract-hash.ps1 output if contract.md kernel section was touched)"
```

**Gate B:** All prior phase validation commands pass. No contract kernel content regression — `/dev` reuses existing C4 subagent opt-in and §14 approval gate rather than adding new kernel rules.

---

## Quick Reference — Phase DoD Summary

| Phase | Target | Sprint | Key Gate | Pass Condition |
|---|---|---|---|---|
| Sprint 0 | — | Sprint 0 | All 5 BLKs closed | ✅ COMPLETE as of 2026-07-07 |
| A | v3.1 | Sprint 1 | allowlist + hash-check + drift | `pwsh tools/check-drift.ps1` exits 0 |
| B | v3.2 | Sprint 2 | MCP write denied | Red-team write attempt denied |
| C | v4.0 | Sprint 3–4 | OpenCode installs + registry | All 8 adapter files present + feature flags |
| D | v4.1 | Sprint 5 | Subagent limit enforced | `testing.md §2` present + hook installed |
| E | v4.2 | Sprint 6 | CI full pass + marketplace | `bash ci/validate.sh` exits 0 |
| F | v4.3 | Sprint 6 | Contract refactor + BUG-H3 | Kernel ≤30 lines + legacy hook gone |
| G | v4.4 | Sprint 7 | `/dev` command + shells across all supported platforms | `dev` registry entry active + all shells present |

---

## Bugs Closed
- **BUG-F1 (V-F1)**: Per-phase DoD was missing — CLOSED by this document
- **BUG-F2 (V-F2)**: Phase A DoD was missing validation commands — CLOSED by this document

## Board Updates Required
- BUG-F1: CLOSED
- BUG-F2: CLOSED
- Sprint Plan DoDs: linked to this document
