<#
.SYNOPSIS  Configure a repo for BOTH Claude Code and GitHub Copilot.
.EXAMPLE  .\install-both.ps1 -RepoPath C:\src\my-service
#>
param(
  [string]$RepoPath = (Get-Location).Path,
  [switch]$Force,
  [switch]$DryRun
)
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'shared\installer\engine.ps1')
Write-Step "Installing BOTH Claude + Copilot into $RepoPath"
& (Join-Path $PSScriptRoot 'install-claude.ps1')  -RepoPath $RepoPath -Force:$Force -DryRun:$DryRun
& (Join-Path $PSScriptRoot 'install-copilot.ps1') -RepoPath $RepoPath -Force:$Force -DryRun:$DryRun
Write-Ok "Both integrations configured. Commit .claude/ and .github/ (gitignore .claude/audit/)."
