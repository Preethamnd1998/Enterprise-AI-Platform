<#
.SYNOPSIS  Update the platform and refresh a repo's vendored Copilot assets.
.DESCRIPTION
  1. Pulls the platform repo (optionally to a specific -Tag).
  2. Re-vendors Copilot assets into the target repo (Claude updates via /plugin update).
  3. Re-stamps version metadata. Detects drift.
.EXAMPLE  ./update-platform.ps1 -RepoPath C:\src\my-service -Tag v3.1.0
#>
param(
  [string]$RepoPath = (Get-Location).Path,
  [string]$Tag = ''
)
. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-PlatformRoot

Write-Step "Updating platform at $root"
git -C $root fetch --all --tags --prune
if ($Tag) { git -C $root checkout $Tag } else { git -C $root pull --ff-only }
$ver = Get-PlatformVersion $root
Write-Ok "platform now at v$ver"

# Detect installed version in the repo (Copilot vendor stamp)
$stampPath = Join-Path $RepoPath '.github\ai-platform\.platform-version'
if (Test-Path $stampPath) {
  $cur = (Get-Content $stampPath -Raw | ConvertFrom-Json).version
  if ($cur -ne $ver) { Write-Warn2 "repo was on v$cur -> updating to v$ver" }
}

Write-Step "Refreshing Copilot vendored assets"
& (Join-Path $PSScriptRoot 'install-copilot.ps1') -RepoPath $RepoPath

Write-Host ""
Write-Step "For Claude, run inside Claude Code:"
Write-Host "  /plugin marketplace update lifetrenz-internal" -ForegroundColor White
Write-Host "  /plugin update enterprise-ai-platform" -ForegroundColor White
Write-Ok "Update complete. Review .github diff and open an MR."
