# adapters/claude/install.ps1
# Enterprise AI Platform — Claude Code adapter installer (v4.15, plugins only)
# Usage:
#   Global install (no -RepoPath):  builds + installs the plugins, writes the contract kernel to ~/.claude/CLAUDE.md, migrates old copies
#   Per-repo install (-RepoPath x): installs settings.json, hooks, .ai/ to a specific repo

param(
  [string]$RepoPath = '',  # Per-repo install target. Empty = global only.
  [switch]$Force,          # Re-copy even if hash matches (skip idempotency check)
  [switch]$DryRun          # Show what would change without writing
)

. (Join-Path $PSScriptRoot '..\..\shared\installer\engine.ps1')
$root    = Get-PlatformRoot
$version = Get-PlatformVersion $root

Write-Step "Enterprise AI Platform v$version -- Claude adapter install"
if ($DryRun)  { Write-Warn2 "DRY RUN -- no files will be written" }
if ($Force)   { Write-Warn2 "FORCE -- skipping idempotency check" }

# ─── GLOBAL INSTALL (plugins only) ───────────────────────────────────────────
# Since v4.14 commands, skills, standards, rules and knowledge ship ONLY in the
# enterprise-ai-platform / knowledge-graph plugins. ~/.claude gets the contract
# KERNEL (CLAUDE.md) and nothing else: a second copy under ~/.claude would be
# loaded again on every turn.
Write-Step "Global: build plugins, write contract kernel, install via claude CLI, migrate old copies"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found on PATH (Node 20+ required). Install it, then re-run." }
$cli = Join-Path $root 'shared\core\cli.js'
$dist = Join-Path $root 'dist\plugins\claude-code'

if ($DryRun) {
  & node $cli plugin:install claude-code
  & node $cli platform:migrate
} else {
  & node $cli plugin:install claude-code --apply
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    & claude plugin marketplace add $dist 2>&1 | Out-Null
    foreach ($p in 'enterprise-ai-platform','knowledge-graph') {
      & claude plugin install "$p@eap-local" 2>&1 | Out-Null
      & claude plugin update  "$p@eap-local"
    }
    # Existing users: remove the pre-4.14 copies the plugins now provide (backup + manifest kept).
    & node $cli platform:migrate --apply
  } else {
    Write-Warn2 "'claude' CLI not on PATH -- install the plugins manually, then run: node $cli platform:migrate --apply"
  }
}

Write-Ok "Global install complete"

# ─── PER-REPO INSTALL ────────────────────────────────────────────────────────
if ($RepoPath -eq '') {
  Write-Host ""
  Write-Host "  Tip: run with -RepoPath <path> to also configure a specific repo" -ForegroundColor DarkGray
  Write-Host "       (adds allowlist settings, hash-check hook, .ai/ directory)" -ForegroundColor DarkGray
  exit 0
}

if (-not (Test-Path $RepoPath)) { throw "Repo path not found: $RepoPath" }
Write-Step "Per-repo: settings + hooks + .ai/ -> $RepoPath"

$claudeDir  = Join-Path $RepoPath '.claude'
$hooksDir   = Join-Path $claudeDir 'hooks'
$aiDir      = Join-Path $RepoPath '.ai'
$adapterSrc = Join-Path $root 'adapters\claude'

New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
New-Item -ItemType Directory -Force -Path $hooksDir  | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $claudeDir 'audit') | Out-Null

# 4. Install settings.json (allowlist + hooks template)
if (-not $DryRun) {
  Install-FileCopy `
    -Source (Join-Path $adapterSrc 'config\settings.json') `
    -Target (Join-Path $claudeDir  'settings.json')
} else {
  Write-Dry "Would install .claude/settings.json (allowlist + PreToolUse hook)"
}

# 5. Install hooks
foreach ($hook in @('audit.js', 'hash-check.js')) {
  if (-not $DryRun) {
    Install-FileCopy `
      -Source (Join-Path $adapterSrc "hooks\$hook") `
      -Target (Join-Path $hooksDir   $hook)
  } else {
    Write-Dry "Would install .claude/hooks/$hook"
  }
}

# 6. Create/update .ai/ directory and write runtime files
if (-not $DryRun) {
  Ensure-AiDirectory -repoPath $RepoPath
  Write-ContractHash -aiDir $aiDir -platformRoot $root
} else {
  Write-Dry "Would create .ai/ and write .contract-hash"
}

# 7. Inject CLAUDE.md per-repo boundaries template (create-if-absent only)
$repoClaude = Join-Path $claudeDir 'CLAUDE.md'
if (-not (Test-Path $repoClaude)) {
  if (-not $DryRun) {
    $templateSrc = Join-Path $adapterSrc 'templates\CLAUDE.md'
    if (Test-Path $templateSrc) {
      Install-FileCopy -Source $templateSrc -Target $repoClaude -NoBackup
      Write-Ok "Created .claude/CLAUDE.md (edit module boundaries)"
    }
  } else {
    Write-Dry "Would create .claude/CLAUDE.md (template)"
  }
} else {
  Write-Skip ".claude/CLAUDE.md (already exists -- module boundaries preserved)"
}

# 8. Update .ai/.platform-version.json
$contractHashFile = Join-Path $root 'shared\contract.md.sha256'
$contractHash     = if (Test-Path $contractHashFile) { (Get-Content $contractHashFile -Raw).Trim() } else { '' }
$settingsHash     = if (-not $DryRun) { Get-FileHashHex (Join-Path $claudeDir 'settings.json') } else { 'dry-run' }

if (-not $DryRun) {
  Update-PlatformVersion `
    -RepoPath       $RepoPath `
    -PlatformVersion $version `
    -AdapterName    'claude' `
    -AdapterVersion $version `
    -Features @{
      'mcp-allowlist'    = $true
      'hash-check-hook'  = $true
      'audit-hook'       = $true
      'drift-gate-ci'    = $false  # set true only after ai-platform-drift.gitlab-ci.yml is included
    } `
    -Hashes @{
      'contract' = $contractHash
      'settings' = $settingsHash
    }
} else {
  Write-Dry "Would update .ai/.platform-version.json"
}

Write-Step "Per-repo install complete"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Add 'include: ci/ai-platform-drift.gitlab-ci.yml' to your .gitlab-ci.yml" -ForegroundColor White
Write-Host "  2. Run: pwsh adapters/claude/upgrade.ps1   # removes legacy hooks" -ForegroundColor White
Write-Host "  3. Run: pwsh tools/check-drift.ps1          # verify drift gate" -ForegroundColor White
