<#
.SYNOPSIS  Install Enterprise AI Platform Antigravity adapter to a consuming repo.
.DESCRIPTION
  Mirrors adapters/opencode/install.ps1: copies shared/ to .agents/ai-platform/; injects
  the contract into root AGENTS.md; installs .agents/workflows/ command shells.
  No hooks (Antigravity has no documented hook API as of 2026-07). No audit.js installed.

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

$agDir   = Join-Path $RepoPath ".agents"
$aiDir   = Join-Path $agDir "ai-platform"
$cmdDir  = Join-Path $agDir "workflows"

Write-Host "Enterprise AI Platform -- Antigravity Adapter Install"
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

# ── Step 4: Copy shared prompts (referenced by prompt-audit.md) ──────────
$promptSrc = Join-Path $platformRoot "shared\prompts"
$promptDst = Join-Path $aiDir "shared\prompts"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $promptSrc $promptDst -Force:$Force
} else { Write-Host "[DRY] $promptSrc/ -> $promptDst/" }

# ── Step 5: Copy Antigravity workflow shells ──────────────────────────────
$agCmdSrc = Join-Path $platformRoot "adapters\antigravity\commands"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $agCmdSrc $cmdDir -Force:$Force
} else { Write-Host "[DRY] $agCmdSrc/ -> $cmdDir/" }

# ── Step 6: Inject AGENTS.md ──────────────────────────────────────────────
$agentsSrc = Join-Path $platformRoot "adapters\antigravity\AGENTS.md"
$agentsDst = Join-Path $RepoPath "AGENTS.md"
if (-not $DryRun) {
  $changes += Install-MarkerInject `
    -SourceFile $agentsSrc `
    -TargetFile $agentsDst `
    -StartMarker 'enterprise-ai-platform:contract:antigravity:start' `
    -EndMarker   'enterprise-ai-platform:contract:antigravity:end' `
    -KernelMarkerStart '<!-- enterprise-ai-platform:kernel:start -->' `
    -KernelMarkerEnd   '<!-- enterprise-ai-platform:kernel:end -->'
} else { Write-Host "[DRY] Inject $agentsSrc -> $agentsDst [marker inject]" }

# -- Step 7: Write .platform-version.json ----------------------------------
if (-not $DryRun) {
  $VERSION = (Get-Content (Join-Path $platformRoot "VERSION") -Raw -Encoding UTF8).Trim()
  $stampPath = Join-Path $agDir ".platform-version.json"
  $stamp = [ordered]@{
    version     = $VERSION
    adapter     = "antigravity"
    installedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    features    = @{ "agents-md" = $true; "workflow-shells" = $true }
  }
  $stamp | ConvertTo-Json | Set-Content -Path $stampPath -Encoding utf8
  Write-Host "Platform version written: $VERSION (antigravity)"
} else { Write-Host "[DRY] Write .platform-version.json" }

Write-Host "`nAntigravity adapter install complete. Files changed: $changes"
