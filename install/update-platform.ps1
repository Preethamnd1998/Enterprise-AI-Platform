<#
.SYNOPSIS  Update the platform source, and optionally refresh a repo's installed adapters.
.DESCRIPTION
  1. Pulls the platform repo (optionally to a specific -Tag).
  2. With no -RepoPath: refreshes only the global Claude Code assets (~/.claude/).
  3. With -RepoPath: delegates to tools/update-platform.ps1 to refresh the requested
     adapter(s) (claude, copilot, opencode, antigravity, or all of them) in that repo.
.EXAMPLE  .\update-platform.ps1                                          # global Claude refresh only
.EXAMPLE  .\update-platform.ps1 -RepoPath C:\src\my-service -Tag v4.4.0
.EXAMPLE  .\update-platform.ps1 -RepoPath C:\src\my-service -Adapter opencode
#>
param(
  [string]$RepoPath = '',
  [string]$Tag = '',
  [ValidateSet('claude','copilot','opencode','antigravity','both')][string]$Adapter = 'both',
  [switch]$Force,
  [switch]$DryRun
)
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'shared\installer\engine.ps1')

Write-Step "Updating platform at $root"
git -C $root fetch --all --tags --prune
if ($Tag) { git -C $root checkout $Tag } else { git -C $root pull --ff-only }
$ver = Get-PlatformVersion $root
Write-Ok "platform now at v$ver"

if ($RepoPath -eq '') {
  Write-Step "No -RepoPath given -- refreshing global Claude Code assets only"
  & (Join-Path $root 'adapters\claude\install.ps1') -Force:$Force -DryRun:$DryRun
} else {
  & (Join-Path $root 'tools\update-platform.ps1') -RepoPath $RepoPath -Adapter $Adapter -PlatformRoot $root -Force:$Force -DryRun:$DryRun
}

Write-Host ""
Write-Step "For Claude, you can also run inside Claude Code:"
Write-Host "  /plugin marketplace update lifetrenz-internal" -ForegroundColor White
Write-Host "  /plugin update enterprise-ai-platform" -ForegroundColor White
