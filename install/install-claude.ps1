<#
.SYNOPSIS
  Install Enterprise AI Platform for Claude Code.

.DESCRIPTION
  Thin entry point -- delegates to adapters/claude/install.ps1, the maintained
  implementation (idempotent, hash-checked, shared installer engine).
  Kept at this path so all three platforms install from one place:
    install/install-claude.ps1
    install/install-copilot.ps1
    install/install-opencode.ps1

  GLOBAL install (default, no -RepoPath):
    - Injects the contract kernel into ~/.claude/CLAUDE.md
    - Copies commands to ~/.claude/commands/
    - Copies standards to ~/.claude/standards/

  PER-REPO install (-RepoPath <path>):
    - Installs .claude/settings.json, hooks, .ai/ directory

.EXAMPLE  .\install-claude.ps1                        # global install
.EXAMPLE  .\install-claude.ps1 -RepoPath C:\src\svc   # + per-repo config
.EXAMPLE  .\install-claude.ps1 -RepoPath C:\src\svc -DryRun
#>
param(
  [string]$RepoPath = '',
  [switch]$Force,
  [switch]$DryRun
)
$root = Split-Path $PSScriptRoot -Parent
& (Join-Path $root 'adapters\claude\install.ps1') -RepoPath $RepoPath -Force:$Force -DryRun:$DryRun
