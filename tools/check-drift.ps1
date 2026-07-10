<#
.SYNOPSIS  CI gate: fail if a repo's vendored platform version drifts from the pinned target.
.DESCRIPTION
  Run in each repo's pipeline. Compares .github/ai-platform/.platform-version against
  -Expected (e.g. the org-pinned version). Exit 1 on drift so the MR is blocked.
.EXAMPLE  ./check-drift.ps1 -RepoPath . -Expected 3.0.0
#>
param(
  [string]$RepoPath = (Get-Location).Path,
  [Parameter(Mandatory)][string]$Expected
)
$stamp = Join-Path $RepoPath '.github\ai-platform\.platform-version.json'
if (-not (Test-Path $stamp)) { Write-Host "::error:: platform not installed"; exit 1 }
$cur = (Get-Content $stamp -Raw | ConvertFrom-Json).version
if ($cur -ne $Expected) {
  Write-Host "::error:: AI Platform drift: repo=$cur expected=$Expected. Run update-platform.ps1."
  exit 1
}
Write-Host "AI Platform version OK: $cur"
exit 0
