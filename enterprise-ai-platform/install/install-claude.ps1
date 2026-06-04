<#
.SYNOPSIS
  Install Enterprise AI Platform v3 for Claude Code.

.DESCRIPTION
  GLOBAL install (default, no -RepoPath):
    - Writes the shared execution contract to ~/.claude/CLAUDE.md so it is
      auto-loaded by Claude Code in every session, in every repo.
    - Copies the 4 commands to ~/.claude/commands/ so /bug-fix, /planning,
      /ui-redesign, and /migration are available everywhere.
    - Copies standards to ~/.claude/standards/ (read lazily by the contract).
    - Writes a global deny-list to ~/.claude/settings.json.

  PER-REPO install (-RepoPath <path>):
    - Copies .claude/CLAUDE.md template (module boundaries) to the repo.
    - Copies .claude/settings.json (Stop hook + deny-list) to the repo.
    - Copies .claude/hooks/audit.js to the repo.
    - Creates .claude/audit/ directory.
    Engineers run per-repo install once per repository.

.EXAMPLE  ./install-claude.ps1                        # global install
.EXAMPLE  ./install-claude.ps1 -RepoPath C:\src\svc   # per-repo config
#>
param(
  [string]$RepoPath = ''
)
. (Join-Path $PSScriptRoot '_common.ps1')
$root = Get-PlatformRoot
$ver  = Get-PlatformVersion $root

# -- GLOBAL INSTALL ----------------------------------------------------------
Write-Step "Global install: Enterprise AI Platform v$ver"

$globalDir     = Join-Path $env:USERPROFILE '.claude'
$globalCmdsDir = Join-Path $globalDir 'commands'
New-Item -ItemType Directory -Force -Path $globalCmdsDir | Out-Null

# 1. Write contract to ~/.claude/CLAUDE.md
#    Claude Code always loads this file - no @-embed or variable interpolation needed.
$contractSrc  = Join-Path $root 'shared\contract.md'
$globalClaude = Join-Path $globalDir 'CLAUDE.md'
$marker       = '<!-- enterprise-ai-platform:contract:start -->'
$endMarker    = '<!-- enterprise-ai-platform:contract:end -->'
$contractBody = Get-Content $contractSrc -Raw

if (Test-Path $globalClaude) {
  $existing = Get-Content $globalClaude -Raw
  if ($existing -match [regex]::Escape($marker)) {
    # Replace just our section (update in place)
    $pattern = '(?s)' + [regex]::Escape($marker) + '.*?' + [regex]::Escape($endMarker)
    $replacement = $marker + "`n" + $contractBody + "`n" + $endMarker
    $updated = $existing -replace $pattern, $replacement
    Set-Content $globalClaude $updated -Encoding utf8
    Write-Ok "Updated contract section in existing ~/.claude/CLAUDE.md"
  } else {
    # Append our section
    $append = "`n`n" + $marker + "`n" + $contractBody + "`n" + $endMarker
    Add-Content $globalClaude $append -Encoding utf8
    Write-Ok "Appended contract to existing ~/.claude/CLAUDE.md"
  }
} else {
  $content = $marker + "`n" + $contractBody + "`n" + $endMarker
  Set-Content $globalClaude $content -Encoding utf8
  Write-Ok "Created ~/.claude/CLAUDE.md with contract"
}

# 2. Copy commands to ~/.claude/commands/
Copy-Item (Join-Path $root 'commands\*') $globalCmdsDir -Force
Write-Ok "Installed commands to ~/.claude/commands/ (/bug-fix /planning /ui-redesign /migration)"

# 3. Copy standards to ~/.claude/standards/
#    Contract section 5 tells the model to Read from ~/.claude/standards/ at runtime.
#    Without this step, lazy standards loading silently fails.
$globalStdDir = Join-Path $globalDir 'standards'
Copy-Tree (Join-Path $root 'standards') $globalStdDir
Write-Ok "Installed standards to ~/.claude/standards/ (lazy-loaded by the contract)"

# 4. Write global deny-list to ~/.claude/settings.json
$globalSettings   = Join-Path $globalDir 'settings.json'
$templateSettings = Join-Path $root 'repo-template\.claude\settings.json'
if (-not (Test-Path $globalSettings)) {
  Copy-Item $templateSettings $globalSettings -Force
  Write-Ok "Wrote global deny-list to ~/.claude/settings.json"
} else {
  Write-Warn2 "~/.claude/settings.json already exists -- merge deny-list manually if needed"
  Write-Warn2 "  Reference: $templateSettings"
}

Write-VersionStamp (Join-Path $globalDir '.platform-version') $ver 'claude-global'
Write-Ok "Global install complete. /bug-fix, /planning, /ui-redesign, /migration available in all repos."

# -- PER-REPO CONFIG (optional) ----------------------------------------------
if ($RepoPath -eq '') {
  Write-Host ""
  Write-Host "  Tip: run with -RepoPath <path> to also configure a specific repo" -ForegroundColor DarkGray
  Write-Host "       (adds module boundaries, audit hook, per-repo settings)" -ForegroundColor DarkGray
  exit 0
}

if (-not (Test-Path $RepoPath)) { throw "Repo path not found: $RepoPath" }
Write-Step "Per-repo config: $RepoPath"

$claudeDir = Join-Path $RepoPath '.claude'
$tplDir    = Join-Path $root 'repo-template\.claude'
New-Item -ItemType Directory -Force -Path (Join-Path $claudeDir 'audit') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $claudeDir 'hooks') | Out-Null

# Boundaries template - keep if already customised
$dst = Join-Path $claudeDir 'CLAUDE.md'
if (Test-Path $dst) {
  Write-Warn2 ".claude/CLAUDE.md exists -- left unchanged (edit module boundaries manually)"
} else {
  Copy-Item (Join-Path $tplDir 'CLAUDE.md') $dst -Force
  Write-Ok  "Wrote .claude/CLAUDE.md (edit module boundaries)"
}

# Per-repo settings (Stop hook + deny-list)
$dstSettings = Join-Path $claudeDir 'settings.json'
Copy-Item (Join-Path $tplDir 'settings.json') $dstSettings -Force
Write-Ok "Wrote .claude/settings.json (Stop hook + deny-list)"

# Audit hook
Copy-Item (Join-Path $tplDir 'hooks\audit.js') (Join-Path $claudeDir 'hooks\audit.js') -Force
Write-Ok "Installed .claude/hooks/audit.js (deterministic Stop hook)"

# Add audit dir to .gitignore if the repo has one
$gitignore = Join-Path $RepoPath '.gitignore'
if (Test-Path $gitignore) {
  if (-not (Get-Content $gitignore -Raw).Contains('.claude/audit')) {
    Add-Content $gitignore "`n# AI Platform audit log`n.claude/audit/" -Encoding utf8
    Write-Ok "Added .claude/audit/ to .gitignore"
  }
}

Write-VersionStamp (Join-Path $claudeDir '.platform-version') $ver 'claude-repo'
Write-Ok "Per-repo config complete."
