<#
.SYNOPSIS  Update Enterprise AI Platform in a consuming repo to the latest version.
.DESCRIPTION
  Compares the installed platform version in the consuming repo against the
  platform source version. If behind, runs the appropriate adapter installer.

  Handles both Claude (adapters/claude) and Copilot (adapters/copilot) adapters.

.PARAMETER RepoPath
  Path to the consuming repo. Defaults to current directory.
.PARAMETER Adapter
  Which adapter to update: 'claude', 'copilot', or 'both'. Defaults to 'both'.
.PARAMETER PlatformRoot
  Path to the platform source repo. Auto-detected if not provided.
.PARAMETER Force
  Force re-install even if version matches.
.PARAMETER DryRun
  Show what would be done without making changes.

.EXAMPLE
  .\tools\update-platform.ps1 -RepoPath C:\repos\my-project
  .\tools\update-platform.ps1 -RepoPath C:\repos\my-project -Adapter claude
  .\tools\update-platform.ps1 -RepoPath . -DryRun
#>
param(
  [string]$RepoPath = (Get-Location).Path,
  [ValidateSet('claude','copilot','both')][string]$Adapter = 'both',
  [string]$PlatformRoot = '',
  [switch]$Force,
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
if (-not $PlatformRoot -or -not (Test-Path (Join-Path $PlatformRoot "shared\contract.md"))) {
  throw "Cannot find platform root (no shared/contract.md)"
}

$sourceVersion = (Get-Content (Join-Path $PlatformRoot "VERSION") -Raw).Trim()

Write-Host "Enterprise AI Platform — Update"
Write-Host "Platform root : $PlatformRoot (v$sourceVersion)"
Write-Host "Repo          : $RepoPath"
Write-Host "Adapter       : $Adapter"
if ($DryRun) { Write-Host "[DRY-RUN mode]" }

# ── Read installed versions ────────────────────────────────────────────────
function Get-InstalledVersion([string]$pvPath) {
  if (-not (Test-Path $pvPath)) { return $null }
  try {
    return (Get-Content $pvPath -Raw | ConvertFrom-Json).version
  } catch { return $null }
}

$claudePv  = Join-Path $RepoPath ".ai\.platform-version.json"
$copilotPv = Join-Path $RepoPath ".github\ai-platform\.platform-version.json"

$claudeVer  = Get-InstalledVersion $claudePv
$copilotVer = Get-InstalledVersion $copilotPv

Write-Host ""
Write-Host "Installed Claude  : $(if ($claudeVer) { $claudeVer } else { '(not installed)' })"
Write-Host "Installed Copilot : $(if ($copilotVer) { $copilotVer } else { '(not installed)' })"
Write-Host "Source version    : $sourceVersion"
Write-Host ""

# ── Update Claude adapter ──────────────────────────────────────────────────
if ($Adapter -in 'claude','both') {
  if ($claudeVer -eq $sourceVersion -and -not $Force) {
    Write-Host "Claude: up to date ($claudeVer)"
  } else {
    $reason = if ($claudeVer) { "v$claudeVer → v$sourceVersion" } else { "not installed" }
    Write-Host "Claude: updating ($reason)"
    if (-not $DryRun) {
      $installScript = Join-Path $PlatformRoot "adapters\claude\install.ps1"
      & $installScript -RepoPath $RepoPath
      Write-Host "Claude: updated to v$sourceVersion"
    } else {
      Write-Host "[DRY-RUN] Would run: $installScript -RepoPath $RepoPath"
    }
  }
}

# ── Update Copilot adapter ─────────────────────────────────────────────────
if ($Adapter -in 'copilot','both') {
  if ($copilotVer -eq $sourceVersion -and -not $Force) {
    Write-Host "Copilot: up to date ($copilotVer)"
  } else {
    $reason = if ($copilotVer) { "v$copilotVer → v$sourceVersion" } else { "not installed" }
    Write-Host "Copilot: updating ($reason)"
    if (-not $DryRun) {
      $installScript = Join-Path $PlatformRoot "adapters\copilot\install.ps1"
      & $installScript -RepoPath $RepoPath
      Write-Host "Copilot: updated to v$sourceVersion"
    } else {
      Write-Host "[DRY-RUN] Would run: $installScript -RepoPath $RepoPath"
    }
  }
}

Write-Host ""
Write-Host "Update complete."
