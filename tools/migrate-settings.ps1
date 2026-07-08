<#
.SYNOPSIS  Migrate a v3.0 deny-list settings.json to the v3.2 allowlist pattern.
.DESCRIPTION
  V3.0 used a 53-entry MCP denylist (fails open — F4 defect).
  V3.2 uses a 28-entry allowlist + "mcp__*" deny wildcard (fails closed — F4 fix).

  This script reads an existing .claude/settings.json, detects if it uses the old
  denylist pattern, backs it up (.prev), and writes the new allowlist pattern.

  Idempotent: if the file already uses the allowlist pattern, no change is made.

.PARAMETER SettingsPath
  Path to the settings.json to migrate. Defaults to .claude/settings.json in current dir.
.PARAMETER PlatformRoot
  Platform source path. Auto-detected if not provided.
.PARAMETER DryRun
  Show what would be done without writing files.

.EXAMPLE
  .\tools\migrate-settings.ps1
  .\tools\migrate-settings.ps1 -SettingsPath C:\repos\my-project\.claude\settings.json
  .\tools\migrate-settings.ps1 -DryRun
#>
param(
  [string]$SettingsPath = (Join-Path (Get-Location) ".claude\settings.json"),
  [string]$PlatformRoot = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ── Locate platform root ───────────────────────────────────────────────────
if (-not $PlatformRoot) {
  $d = $PSScriptRoot
  while ($d -and -not (Test-Path (Join-Path $d "shared\contract.md"))) {
    $d = Split-Path $d -Parent
  }
  $PlatformRoot = $d
}

Write-Host "migrate-settings.ps1 — deny-list → allowlist migration"
Write-Host "Target: $SettingsPath"

# ── Read current settings ──────────────────────────────────────────────────
if (-not (Test-Path $SettingsPath)) {
  Write-Host "Settings file not found: $SettingsPath"
  Write-Host "Nothing to migrate. Run install.ps1 to create a fresh allowlist settings."
  exit 0
}

$raw  = Get-Content $SettingsPath -Raw
$settings = $raw | ConvertFrom-Json

# ── Detect pattern ─────────────────────────────────────────────────────────
$denyArray = @($settings.permissions.deny)
$allowArray = @($settings.permissions.allow)

$hasDenyWildcard = $denyArray -contains "mcp__*"
$hasLargeDenylist = $denyArray.Count -gt 10

if ($hasDenyWildcard -and $allowArray.Count -gt 0) {
  Write-Host "Already using allowlist pattern ($($allowArray.Count) allow entries, mcp__* in deny)."
  Write-Host "No migration needed."
  exit 0
}

if (-not $hasLargeDenylist) {
  Write-Host "WARN: settings.json has $($denyArray.Count) deny entries (expected >10 for v3.0 denylist)."
  Write-Host "Cannot safely auto-migrate. Review manually and run install.ps1 if needed."
  exit 1
}

# ── v3.0 denylist detected — migrate ─────────────────────────────────────
Write-Host ""
Write-Host "v3.0 denylist detected ($($denyArray.Count) deny entries, 0 allow entries)."
Write-Host "Migrating to v3.2 allowlist pattern..."

if ($DryRun) {
  Write-Host "[DRY-RUN] Would create backup: $SettingsPath.prev"
  Write-Host "[DRY-RUN] Would replace with allowlist template from platform source"
  Write-Host "[DRY-RUN] New allow count: 28  New deny: [mcp__*, Bash(git push*), ...]"
  exit 0
}

# Back up existing
Copy-Item $SettingsPath "$SettingsPath.prev" -Force
Write-Host "Backup created: $SettingsPath.prev"

# Read template from platform source
$templatePath = Join-Path $PlatformRoot "adapters\claude\config\settings.json"
if (-not (Test-Path $templatePath)) {
  Write-Host "ERROR: template not found at $templatePath"
  Write-Host "Restore from backup: Copy-Item '$SettingsPath.prev' '$SettingsPath'"
  exit 1
}

# Copy template (preserving custom hooks from existing settings if any)
$template = Get-Content $templatePath -Raw | ConvertFrom-Json
$existingHooks = $settings.hooks

# Merge: keep existing hooks that are NOT the legacy PostToolUse[matcher=Skill] hook
if ($existingHooks) {
  $filteredHooks = [PSCustomObject]@{}
  $existingHooks.PSObject.Properties | ForEach-Object {
    $event = $_.Name
    $hooks  = $_.Value
    if ($event -eq "PostToolUse") {
      $filtered = @($hooks | Where-Object { $_.matcher -ne "Skill" })
      if ($filtered.Count -gt 0) {
        Add-Member -InputObject $filteredHooks -MemberType NoteProperty -Name $event -Value $filtered
      }
    } else {
      Add-Member -InputObject $filteredHooks -MemberType NoteProperty -Name $event -Value $hooks
    }
  }
  # Merge with template hooks (template hooks take precedence for PreToolUse/Stop)
  $template.hooks.PSObject.Properties | ForEach-Object {
    if (-not ($filteredHooks.PSObject.Properties[$_.Name])) {
      Add-Member -InputObject $filteredHooks -MemberType NoteProperty -Name $_.Name -Value $_.Value
    }
  }
  $template.hooks = $filteredHooks
}

$template | ConvertTo-Json -Depth 10 | Set-Content $SettingsPath -Encoding utf8
Write-Host "Migration complete. New settings written."
Write-Host ""
Write-Host "Changes:"
Write-Host "  Before: $($denyArray.Count)-entry denylist (fails open)"
Write-Host "  After:  $($template.permissions.allow.Count)-entry allowlist + mcp__* deny (fails closed)"
Write-Host ""
Write-Host "Verify: open a new Claude Code session and check that an unlisted MCP tool is denied."
Write-Host "Rollback: Copy-Item '$SettingsPath.prev' '$SettingsPath' -Force"
