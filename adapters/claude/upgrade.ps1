# adapters/claude/upgrade.ps1
# Enterprise AI Platform — Claude adapter upgrade script.
# Run ONCE per machine after upgrading from v3.0 to v3.1.
# Safe to re-run (idempotent — checks for each condition before acting).

param(
  [switch]$DryRun  # Print what would change without writing
)

$ErrorActionPreference = 'Stop'
$globalDir      = Join-Path $env:USERPROFILE '.claude'
$globalSettings = Join-Path $globalDir 'settings.json'

function Write-Step([string]$msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)    { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Skip([string]$msg)  { Write-Host "  --  $msg (no change needed)" -ForegroundColor DarkGray }
function Write-Dry([string]$msg)   { Write-Host "  DRY $msg" -ForegroundColor Magenta }
function Write-Warn2([string]$msg) { Write-Host "  !   $msg" -ForegroundColor Yellow }

Write-Step "Enterprise AI Platform v3.0 → v3.1 upgrade (Claude adapter)"
if ($DryRun) { Write-Warn2 "DRY RUN — no files will be modified" }

# ── Step 1: Remove BUG-H3 legacy PostToolUse → Skill hook ───────────────────
# The v3.0 installer left a static summary template hook that fires after every
# Skill tool call. It prints a fill-in-the-blanks template with no real value.
# This hook is removed in v3.1 (TK-039).

Write-Step "Step 1: De-register legacy PostToolUse -> Skill hook (BUG-H3)"

if (-not (Test-Path $globalSettings)) {
  Write-Skip "~/.claude/settings.json not found — nothing to de-register"
} else {
  $raw    = Get-Content $globalSettings -Raw
  $parsed = $raw | ConvertFrom-Json

  $legacyHooks = $null
  if ($parsed.hooks -and $parsed.hooks.PostToolUse) {
    $legacyHooks = @($parsed.hooks.PostToolUse | Where-Object { $_.matcher -eq 'Skill' })
  }

  if (-not $legacyHooks -or $legacyHooks.Count -eq 0) {
    Write-Skip "No legacy PostToolUse -> Skill hook found"
  } else {
    Write-Warn2 "Found $($legacyHooks.Count) legacy Skill hook(s) to remove"
    if ($DryRun) {
      Write-Dry "Would remove PostToolUse[matcher='Skill'] from ~/.claude/settings.json"
    } else {
      # Backup before modifying
      Copy-Item $globalSettings "$globalSettings.prev" -Force
      Write-Ok "Backed up ~/.claude/settings.json to .prev"

      # Remove the Skill hooks from PostToolUse array
      $remaining = @($parsed.hooks.PostToolUse | Where-Object { $_.matcher -ne 'Skill' })
      if ($remaining.Count -eq 0) {
        # No hooks left in PostToolUse — remove the PostToolUse key
        $parsed.hooks.PSObject.Properties.Remove('PostToolUse')
        Write-Ok "Removed PostToolUse array (was empty after cleanup)"
      } else {
        $parsed.hooks.PostToolUse = $remaining
        Write-Ok "Kept $($remaining.Count) remaining PostToolUse hook(s)"
      }

      $parsed | ConvertTo-Json -Depth 10 | Set-Content $globalSettings -Encoding utf8
      Write-Ok "Removed legacy Skill hook from ~/.claude/settings.json (BUG-H3 fixed)"
    }
  }
}

# ── Step 2: Verify allowlist pattern is in place ─────────────────────────────
Write-Step "Step 2: Verify MCP allowlist is active"

if (-not (Test-Path $globalSettings)) {
  Write-Warn2 "~/.claude/settings.json not found — run install.ps1 to install"
} else {
  $check = Get-Content $globalSettings -Raw | ConvertFrom-Json
  $hasDenyAll = $check.permissions -and $check.permissions.deny -and
                ($check.permissions.deny -contains 'mcp__*')
  $hasAllow   = $check.permissions -and $check.permissions.allow -and
                $check.permissions.allow.Count -gt 0

  if ($hasDenyAll -and $hasAllow) {
    Write-Ok "Allowlist pattern confirmed (mcp__* deny + specific allow entries)"
  } else {
    Write-Warn2 "Allowlist not detected — run adapters/claude/install.ps1 to apply v3.1 settings"
  }
}

# ── Step 3: Verify hash-check hook is in place ───────────────────────────────
Write-Step "Step 3: Verify PreToolUse hash-check hook"

if (-not (Test-Path $globalSettings)) {
  Write-Warn2 "~/.claude/settings.json not found"
} else {
  $check    = Get-Content $globalSettings -Raw | ConvertFrom-Json
  $hasHook  = $check.hooks -and $check.hooks.PreToolUse -and
              ($check.hooks.PreToolUse | Where-Object { $_.hooks -and ($_.hooks | Where-Object { $_.command -match 'hash-check' }) })

  if ($hasHook) {
    Write-Ok "PreToolUse hash-check hook confirmed"
  } else {
    Write-Warn2 "hash-check hook not found — run adapters/claude/install.ps1 to apply"
  }
}

Write-Host ""
Write-Host "Upgrade complete." -ForegroundColor Green
if ($DryRun) {
  Write-Host "Re-run without -DryRun to apply changes." -ForegroundColor Magenta
}

# ── Rollback note ─────────────────────────────────────────────────────────────
# If this script removes something it should not:
#   1. Restore from backup: Copy-Item "$globalSettings.prev" $globalSettings -Force
#   2. Re-run this script with -DryRun to verify state
