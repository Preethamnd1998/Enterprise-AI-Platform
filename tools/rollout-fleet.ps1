<#
.SYNOPSIS  Roll the platform out to many repos, one MR each (no manual per-repo work).
.DESCRIPTION
  Reads a repos.txt (one GitLab clone URL per line), clones to a temp dir, runs the
  appropriate installer, commits on a branch, pushes, and opens an MR via glab.
  Idempotent and resumable. Use -DryRun to validate without making any git changes.
.EXAMPLE  ./rollout-fleet.ps1 -ReposFile .\repos.txt -Mode both
.EXAMPLE  ./rollout-fleet.ps1 -ReposFile .\repos.txt -Mode claude -DryRun
#>
param(
  [Parameter(Mandatory)][string]$ReposFile,
  [ValidateSet('claude','copilot','both')][string]$Mode = 'both',
  [string]$WorkDir = (Join-Path $env:TEMP 'ai-platform-fleet'),
  [string]$Branch,
  [switch]$DryRun
)
. (Join-Path $PSScriptRoot '..\install\_common.ps1')

$platformRoot = Get-PlatformRoot
$version = Get-PlatformVersion $platformRoot
if (-not $Branch) { $Branch = "chore/ai-platform-v$version" }
$installer = Join-Path $platformRoot "install\install-$Mode.ps1"

if (-not (Test-Path $installer)) { throw "Installer not found: $installer" }
if (-not (Test-Path $ReposFile))  { throw "repos.txt not found: $ReposFile" }

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

$repos = Get-Content $ReposFile | Where-Object { $_ -and -not $_.StartsWith('#') }
if (-not $repos) { Write-Warn2 "repos.txt is empty — nothing to do"; exit 0 }

if ($DryRun) { Write-Step "DRY-RUN mode — no git writes or MRs will be created" }

$ok = 0; $skipped = 0; $fail = @()

foreach ($url in $repos) {
  $name = ($url -split '/')[-1] -replace '\.git$',''
  $dir  = Join-Path $WorkDir $name
  Write-Step "[$name] $url"
  try {
    if (-not (Test-Path $dir)) {
      if ($DryRun) { Write-Warn2 "  DRY-RUN: would clone $url to $dir"; $skipped++; continue }
      git clone $url $dir
    } else {
      git -C $dir pull --ff-only
    }

    git -C $dir checkout -B $Branch

    if ($DryRun) {
      Write-Ok "  DRY-RUN: would run $installer on $dir, commit + push + open MR"
      $skipped++; continue
    }

    & $installer -RepoPath $dir

    $status = git -C $dir status --porcelain
    if (-not $status) {
      Write-Warn2 "  No changes after install — repo may already be up to date"
      $skipped++; continue
    }

    git -C $dir add .claude .github
    git -C $dir commit -m "chore: adopt Enterprise AI Platform v$version ($Mode)"
    git -C $dir push -u origin $Branch --force-with-lease

    if (Get-Command glab -ErrorAction SilentlyContinue) {
      glab mr create `
        --source-branch $Branch `
        --title "chore: adopt Enterprise AI Platform v$version" `
        --description "Automated fleet rollout (v$version, mode=$Mode). Reviewer: inspect .claude/CLAUDE.md and .github/ai-platform/ for correctness." `
        --yes
    } else {
      Write-Warn2 "  glab not found — branch pushed, open MR manually"
    }
    $ok++; Write-Ok "$name done"
  } catch {
    $fail += $name; Write-Warn2 "$name FAILED: $_"
  }
}

Write-Host ""
Write-Step "Rollout complete: $ok succeeded · $skipped skipped · $($fail.Count) failed"
if ($fail) { $fail | ForEach-Object { Write-Warn2 "  FAILED: $_" } }
if ($DryRun) { Write-Step "Re-run without -DryRun to execute." }
