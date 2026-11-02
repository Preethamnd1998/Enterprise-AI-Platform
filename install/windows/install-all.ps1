# Windows: install the platform runtime, then (optionally) client integrations.
#   .\install\windows\install-all.ps1 [-Apply] [-WithCortex] [-Clients all|claude-code,cursor,opencode|none]
# Dry-run unless -Apply. Thin wrapper over `node shared/core/cli.js` (same logic as macOS/Linux).
# NOTE: authored/tested WITHOUT a Windows machine — path logic is covered by mocked tests only.
param([switch]$Apply, [switch]$WithCortex, [string]$Clients = 'none')
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $Root
foreach ($t in 'node', 'python') {
  if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { throw "$t not found on PATH (install Node >= 20 / Python >= 3.10; avoid the Microsoft Store python stub)" }
}
if (-not (Test-Path -LiteralPath (Join-Path $Root 'paths.local.env'))) {
  Write-Warning 'paths.local.env missing: copy paths.local.env.example and set PROJECTS_DIR.'
}
$flags = @(); if ($Apply) { $flags += '--apply' }
$rt = @('platform:install') + $flags; if ($WithCortex) { $rt += '--with-cortex' }
& node shared/core/cli.js @rt; if ($LASTEXITCODE) { exit $LASTEXITCODE }
& node shared/core/cli.js platform:doctor; if ($LASTEXITCODE) { exit $LASTEXITCODE }
if ($Clients -ne 'none') { & node shared/core/cli.js plugin:install $Clients @flags; exit $LASTEXITCODE }
