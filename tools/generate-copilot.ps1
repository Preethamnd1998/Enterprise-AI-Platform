<#
.SYNOPSIS  Generate Copilot prompt + chatmode shells from commands/registry.yml.
.DESCRIPTION
  Reads shared/commands/registry.yml and produces:
    adapters/copilot/prompts/<slug>.prompt.md
    adapters/copilot/chatmodes/<slug>.chatmode.md
  for every active command that lists 'copilot' in supported_platforms.

  Only creates MISSING files. Existing files are not overwritten unless -Force.
  After running, CI no-dup-shared checks the shells reference shared content
  (not duplicate it).

.PARAMETER Force
  Overwrite existing shell files.
.PARAMETER DryRun
  Print what would be created without writing files.

.EXAMPLE
  .\tools\generate-copilot.ps1
  .\tools\generate-copilot.ps1 -Force
  .\tools\generate-copilot.ps1 -DryRun
#>
param(
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Find-PlatformRoot {
  $d = $PSScriptRoot
  while ($d -and -not (Test-Path (Join-Path $d "shared\commands\registry.yml"))) {
    $d = Split-Path $d -Parent
  }
  if (-not $d) { throw "Cannot find platform root (no shared/commands/registry.yml)" }
  return $d
}

$root   = Find-PlatformRoot
$regPath = Join-Path $root "shared\commands\registry.yml"
$promptDir   = Join-Path $root "adapters\copilot\prompts"
$chatmodeDir = Join-Path $root "adapters\copilot\chatmodes"

if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $promptDir   | Out-Null
  New-Item -ItemType Directory -Force -Path $chatmodeDir | Out-Null
}

# Minimal YAML parse — extract active commands for copilot
$reg = Get-Content $regPath -Raw
$commands = [System.Collections.Generic.List[hashtable]]::new()
$current  = $null

foreach ($line in ($reg -split "`n")) {
  if ($line -match "^\s*-\s*id:\s*(\S+)") {
    if ($current) { $commands.Add($current) }
    $current = @{ id = $matches[1]; slug = ''; title = ''; status = ''; platforms = @() }
  }
  elseif ($current) {
    if ($line -match "^\s*slug:\s*(\S+)")   { $current.slug   = $matches[1] }
    if ($line -match "^\s*title:\s*""(.+)""") { $current.title  = $matches[1] }
    if ($line -match "^\s*status:\s*(\S+)") { $current.status = $matches[1] }
    if ($line -match "supported_platforms:\s*\[(.+)\]") {
      $current.platforms = $matches[1] -split ',\s*' | ForEach-Object { $_.Trim() }
    }
  }
}
if ($current) { $commands.Add($current) }

$active = $commands | Where-Object { $_.status -eq 'active' -and 'copilot' -in $_.platforms }

$created = 0; $skipped = 0

foreach ($cmd in $active) {
  $slug  = $cmd.slug
  $title = $cmd.title
  $contractRef = "../ai-platform/shared/contract.md"
  $commandRef  = "../ai-platform/shared/commands/$slug.md"

  # ── .prompt.md ────────────────────────────────────────────────────────────
  $promptPath = Join-Path $promptDir "$slug.prompt.md"
  if (-not (Test-Path $promptPath) -or $Force) {
    $promptContent = @"
---
description: $title — Enterprise AI Platform command shell
mode: agent
tools: ['codebase', 'search', 'editFiles', 'runCommands']
---

# /$slug

Follow the shared contract: [$contractRef]($contractRef).
Read the full command definition: [$commandRef]($commandRef).

Input: `\${input:task:Describe the task or paste Redmine ID / MR / stack trace}`.

Deliver analysis first (read-only phase). Stop for approval before making any change.
"@
    if ($DryRun) {
      Write-Host "[DRY-RUN] Would create: $promptPath"
    } else {
      Set-Content $promptPath $promptContent -Encoding utf8
      Write-Host "Created: $promptPath"
    }
    $created++
  } else {
    Write-Host "Skipped (exists): $promptPath"
    $skipped++
  }

  # ── .chatmode.md ──────────────────────────────────────────────────────────
  $chatmodePath = Join-Path $chatmodeDir "$slug.chatmode.md"
  if (-not (Test-Path $chatmodePath) -or $Force) {
    $chatmodeContent = @"
---
description: $title — Enterprise AI Platform task mode
---

# $title

This is the /$slug task mode.

**Full specification:** [$commandRef]($commandRef)
**Execution contract:** [$contractRef]($contractRef)

Follow the contract: no-scan, depth-1, both gates (completeness + regression) before done.
Read-only discovery phase first. Stop for approval before any change.
"@
    if ($DryRun) {
      Write-Host "[DRY-RUN] Would create: $chatmodePath"
    } else {
      Set-Content $chatmodePath $chatmodeContent -Encoding utf8
      Write-Host "Created: $chatmodePath"
    }
    $created++
  } else {
    Write-Host "Skipped (exists): $chatmodePath"
    $skipped++
  }
}

Write-Host "`nDone. Created: $created  Skipped: $skipped"
