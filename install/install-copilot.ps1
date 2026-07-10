<#
.SYNOPSIS
  Install Enterprise AI Platform Copilot adapter into a consuming repo.

.DESCRIPTION
  Thin entry point -- delegates to adapters/copilot/install.ps1, the maintained
  implementation (idempotent, hash-checked, shared installer engine).
  Copilot has no plugin system, so shared content is vendored into the repo
  under .github/ai-platform/, plus copilot-instructions.md, prompts, and chatmodes.

.EXAMPLE  .\install-copilot.ps1 -RepoPath C:\src\my-service
.EXAMPLE  .\install-copilot.ps1 -RepoPath C:\src\my-service -DryRun
#>
param(
  [string]$RepoPath = (Get-Location).Path,
  [switch]$Force,
  [switch]$DryRun
)
$root = Split-Path $PSScriptRoot -Parent
& (Join-Path $root 'adapters\copilot\install.ps1') -RepoPath $RepoPath -Force:$Force -DryRun:$DryRun
