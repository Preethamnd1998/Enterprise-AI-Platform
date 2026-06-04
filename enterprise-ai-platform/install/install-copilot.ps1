<#
.SYNOPSIS  Configure a target repo for GitHub Copilot (Enterprise AI Platform v3).
.DESCRIPTION
  Copilot has NO plugin system, so shared content must be VENDORED into the repo.
  This copies the contract/standards/templates into .github/ai-platform/ and installs
  copilot-instructions.md + prompt files. The updater refreshes these on new releases.
.EXAMPLE  ./install-copilot.ps1 -RepoPath C:\src\my-service
#>
param(
  [string]$RepoPath = (Get-Location).Path
)
. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-PlatformRoot
$ver  = Get-PlatformVersion $root

Write-Step "Configuring Copilot for repo: $RepoPath (platform v$ver)"
if (-not (Test-Path $RepoPath)) { throw "Repo path not found: $RepoPath" }

$gh      = Join-Path $RepoPath '.github'
$vendor  = Join-Path $gh 'ai-platform'
$prompts = Join-Path $gh 'prompts'

# 1. Vendor the single source (contract + standards + templates) — refreshed on update
Write-Step "Vendoring shared source into .github/ai-platform/"
foreach ($d in @('shared','standards','templates')) {
  Copy-Tree (Join-Path $root $d) (Join-Path $vendor $d)
}
Write-Ok "vendored shared, standards, templates"

# 2. Repo profile (boundaries) — keep existing if present
$repoMd = Join-Path $vendor 'REPO.md'
if (-not (Test-Path $repoMd)) {
  Copy-Item (Join-Path $root 'repo-template\.github\ai-platform\REPO.md') $repoMd -Force
  Write-Ok "wrote .github/ai-platform/REPO.md (edit boundaries)"
} else { Write-Warn2 "REPO.md exists - left unchanged" }

# 3. Copilot entrypoint + prompts + chat modes
Copy-Item (Join-Path $root 'adapters\copilot\copilot-instructions.md') (Join-Path $gh 'copilot-instructions.md') -Force
Copy-Tree (Join-Path $root 'adapters\copilot\prompts')   $prompts
Copy-Tree (Join-Path $root 'adapters\copilot\chatmodes') (Join-Path $gh 'chatmodes')
Write-Ok "installed copilot-instructions.md + prompts (/name) + chatmodes (dropdown)"

Write-VersionStamp (Join-Path $vendor '.platform-version') $ver 'copilot'
Write-Ok "stamped .github/ai-platform/.platform-version = $ver"
Write-Warn2 "Copilot cannot hard-enforce MCP read-only. Enforce via read-only PATs on MCP servers."
