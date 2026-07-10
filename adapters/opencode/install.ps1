<#
.SYNOPSIS  Install Enterprise AI Platform OpenCode adapter to a consuming repo.
.DESCRIPTION
  SP-04 approach: copies shared/ to .opencode/ai-platform/; creates AGENTS.md;
  installs .opencode/command/ shells.
  SP-03: no hooks (OC has no hook API). No audit.js installed.

.PARAMETER RepoPath
  Path to the consuming repo root. Defaults to current directory.
.PARAMETER Force
  Re-copy even if destination hash matches source.
.PARAMETER DryRun
  Show what would be done without writing files.
#>
param(
  [string]$RepoPath = (Get-Location).Path,
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ── Locate platform root ───────────────────────────────────────────────────
$scriptDir = $PSScriptRoot
$platformRoot = $scriptDir
while ($platformRoot -and -not (Test-Path (Join-Path $platformRoot "shared\contract.md"))) {
  $platformRoot = Split-Path $platformRoot -Parent
}
if (-not $platformRoot) { throw "Cannot find platform root (no shared/contract.md)" }

# ── Load engine ───────────────────────────────────────────────────────────
$enginePath = Join-Path $platformRoot "shared\installer\engine.ps1"
if (-not (Test-Path $enginePath)) { throw "Engine not found: $enginePath" }
. $enginePath

$ocDir   = Join-Path $RepoPath ".opencode"
$aiDir   = Join-Path $ocDir "ai-platform"
$cmdDir  = Join-Path $ocDir "commands"

Write-Host "Enterprise AI Platform -- OpenCode Adapter Install"
Write-Host "Platform root : $platformRoot"
Write-Host "Repo          : $RepoPath"
if ($DryRun) { Write-Host "[DRY-RUN mode]" }

$changes = 0

# ── Step 1: Copy shared contract ─────────────────────────────────────────
$contractSrc = Join-Path $platformRoot "shared\contract.md"
$contractDst = Join-Path $aiDir "shared\contract.md"
if (-not $DryRun) {
  $changes += Install-FileCopy $contractSrc $contractDst -Force:$Force
} else { Write-Host "[DRY] $contractSrc -> $contractDst" }

# ── Step 2: Copy shared commands ─────────────────────────────────────────
$cmdSrc = Join-Path $platformRoot "shared\commands"
$cmdDst = Join-Path $aiDir "shared\commands"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $cmdSrc $cmdDst -Force:$Force
} else { Write-Host "[DRY] $cmdSrc/ -> $cmdDst/" }

# ── Step 3: Copy shared standards ────────────────────────────────────────
$stdSrc = Join-Path $platformRoot "shared\standards"
$stdDst = Join-Path $aiDir "standards"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $stdSrc $stdDst -Force:$Force
} else { Write-Host "[DRY] $stdSrc/ -> $stdDst/" }

# ── Step 4: Copy OC command shells ───────────────────────────────────────
$ocCmdSrc = Join-Path $platformRoot "adapters\opencode\commands"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $ocCmdSrc $cmdDir -Force:$Force
} else { Write-Host "[DRY] $ocCmdSrc/ -> $cmdDir/" }

# ── Step 5: Inject AGENTS.md ──────────────────────────────────────────────
$agentsSrc = Join-Path $platformRoot "adapters\opencode\AGENTS.md"
$agentsDst = Join-Path $RepoPath "AGENTS.md"
if (-not $DryRun) {
  $changes += Install-MarkerInject `
    -Source $agentsSrc `
    -Target $agentsDst `
    -MarkerStart "<!-- enterprise-ai-platform:contract:start -->" `
    -MarkerEnd   "<!-- enterprise-ai-platform:contract:end -->"
} else { Write-Host "[DRY] Inject $agentsSrc -> $agentsDst [marker inject]" }

# -- Step 6: Write .platform-version.json ----------------------------------
if (-not $DryRun) {
  $VERSION = (Get-Content (Join-Path $platformRoot "VERSION") -Raw).Trim()
  $stampPath = Join-Path $ocDir ".platform-version.json"
  $stamp = [ordered]@{
    version     = $VERSION
    adapter     = "opencode"
    installedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    features    = @{ "agents-md" = $true; "command-shells" = $true }
  }
  $stamp | ConvertTo-Json | Set-Content -Path $stampPath -Encoding utf8
  Write-Host "Platform version written: $VERSION (opencode)"
} else { Write-Host "[DRY] Write .platform-version.json" }

Write-Host "`nOpenCode adapter install complete. Files changed: $changes"
