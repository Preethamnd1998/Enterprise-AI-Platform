<#
.SYNOPSIS
  Install Enterprise AI Platform OpenCode adapter into a consuming repo.

.DESCRIPTION
  Thin entry point -- delegates to adapters/opencode/install.ps1, the maintained
  implementation (idempotent, hash-checked, shared installer engine).
  Copies shared/ to .opencode/ai-platform/, injects AGENTS.md, and installs
  .opencode/command/ shells. OpenCode has no hook API -- no audit trail.

.EXAMPLE  .\install-opencode.ps1 -RepoPath C:\src\my-service
.EXAMPLE  .\install-opencode.ps1 -RepoPath C:\src\my-service -DryRun
#>
param(
  [string]$RepoPath = (Get-Location).Path,
  [switch]$Force,
  [switch]$DryRun
)
$root = Split-Path $PSScriptRoot -Parent
& (Join-Path $root 'adapters\opencode\install.ps1') -RepoPath $RepoPath -Force:$Force -DryRun:$DryRun
