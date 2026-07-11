<#
.SYNOPSIS
  Install Enterprise AI Platform Antigravity adapter into a consuming repo.

.DESCRIPTION
  Thin entry point -- delegates to adapters/antigravity/install.ps1, the maintained
  implementation (idempotent, hash-checked, shared installer engine).
  Copies shared/ to .agents/ai-platform/, injects AGENTS.md, and installs
  .agents/workflows/ shells. Antigravity has no documented hook API -- no audit trail.

.EXAMPLE  .\install-antigravity.ps1 -RepoPath C:\src\my-service
.EXAMPLE  .\install-antigravity.ps1 -RepoPath C:\src\my-service -DryRun
#>
param(
  [string]$RepoPath = (Get-Location).Path,
  [switch]$Force,
  [switch]$DryRun
)
$root = Split-Path $PSScriptRoot -Parent
& (Join-Path $root 'adapters\antigravity\install.ps1') -RepoPath $RepoPath -Force:$Force -DryRun:$DryRun
