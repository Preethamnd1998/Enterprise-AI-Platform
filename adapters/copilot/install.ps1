<#
.SYNOPSIS  Install Enterprise AI Platform Copilot adapter to a consuming repo.
.DESCRIPTION
  Reads adapters/copilot/file-map.yml and installs:
    - shared/contract.md       → .github/ai-platform/shared/contract.md
    - shared/commands/         → .github/ai-platform/shared/commands/
    - shared/standards/        → .github/ai-platform/standards/
    - adapters/copilot/prompts/    → .github/prompts/
    - adapters/copilot/chatmodes/  → .github/chatmodes/
    - copilot-instructions.md      → .github/copilot-instructions.md (marker inject)
    - .github/ai-platform/.platform-version.json (generated)

  All copies are idempotent (hash-based). .prev backup before any overwrite.

.PARAMETER RepoPath
  Path to the consuming repo root. Defaults to current directory.
.PARAMETER Force
  Re-copy even if destination hash matches source.
.PARAMETER DryRun
  Show what would be done without writing files.

.EXAMPLE
  .\adapters\copilot\install.ps1 -RepoPath C:\repos\my-project
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

# ── Resolve targets ───────────────────────────────────────────────────────
$aiPlatformDir = Join-Path $RepoPath ".github\ai-platform"
$promptsDir    = Join-Path $RepoPath ".github\prompts"
$chatmodesDir  = Join-Path $RepoPath ".github\chatmodes"
$copilotsDir   = Join-Path $RepoPath ".github"

Write-Host "Enterprise AI Platform -- Copilot Adapter Install"
Write-Host "Platform root : $platformRoot"
Write-Host "Repo          : $RepoPath"
if ($DryRun) { Write-Host "[DRY-RUN mode]" }

$changes = 0

# ── Step 1: Copy shared contract ─────────────────────────────────────────
$contractSrc = Join-Path $platformRoot "shared\contract.md"
$contractDst = Join-Path $aiPlatformDir "shared\contract.md"
if (-not $DryRun) {
  $changes += Install-FileCopy $contractSrc $contractDst -Force:$Force
} else { Write-Host "[DRY] $contractSrc -> $contractDst" }

# ── Step 2: Copy shared commands ─────────────────────────────────────────
$cmdSrc = Join-Path $platformRoot "shared\commands"
$cmdDst = Join-Path $aiPlatformDir "shared\commands"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $cmdSrc $cmdDst -Force:$Force
} else { Write-Host "[DRY] $cmdSrc/ -> $cmdDst/" }

# ── Step 3: Copy shared standards ────────────────────────────────────────
$stdSrc = Join-Path $platformRoot "shared\standards"
$stdDst = Join-Path $aiPlatformDir "standards"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $stdSrc $stdDst -Force:$Force
} else { Write-Host "[DRY] $stdSrc/ -> $stdDst/" }

# ── Step 4: Copy Copilot prompt shells ──────────────────────────────────
$promptSrc = Join-Path $platformRoot "adapters\copilot\prompts"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $promptSrc $promptsDir -Force:$Force
} else { Write-Host "[DRY] $promptSrc/ -> $promptsDir/" }

# ── Step 5: Copy Copilot chatmode shells ─────────────────────────────────
$chatSrc = Join-Path $platformRoot "adapters\copilot\chatmodes"
if (-not $DryRun) {
  $changes += Install-DirectoryCopy $chatSrc $chatmodesDir -Force:$Force
} else { Write-Host "[DRY] $chatSrc/ -> $chatmodesDir/" }

# ── Step 6: Inject copilot-instructions.md ───────────────────────────────
$ciSrc = Join-Path $platformRoot "adapters\copilot\copilot-instructions.md"
$ciDst = Join-Path $copilotsDir "copilot-instructions.md"
if (-not $DryRun) {
  $changes += Install-MarkerInject `
    -SourceFile $ciSrc `
    -TargetFile $ciDst `
    -StartMarker 'enterprise-ai-platform:contract:start' `
    -EndMarker   'enterprise-ai-platform:contract:end' `
    -KernelMarkerStart '<!-- enterprise-ai-platform:kernel:start -->' `
    -KernelMarkerEnd   '<!-- enterprise-ai-platform:kernel:end -->'
} else { Write-Host "[DRY] Inject $ciSrc -> $ciDst [marker inject]" }

# -- Step 7: Write .platform-version.json ---------------------------------
if (-not $DryRun) {
  $VERSION  = Get-Content (Join-Path $platformRoot "VERSION") -Raw
  $VERSION  = $VERSION.Trim()
  $stampPath = Join-Path $aiPlatformDir ".platform-version.json"
  $stamp = [ordered]@{
    version     = $VERSION
    adapter     = "copilot"
    installedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    features    = @{ "contract-copy" = $true; "prompt-shells" = $true }
  }
  $stamp | ConvertTo-Json | Set-Content -Path $stampPath -Encoding utf8
  Write-Host "Platform version written: $VERSION (copilot)"
} else { Write-Host "[DRY] Write .platform-version.json" }

Write-Host "`nCopilot adapter install complete. Files changed: $changes"
