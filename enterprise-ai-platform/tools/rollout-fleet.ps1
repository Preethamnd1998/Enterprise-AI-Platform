<#
.SYNOPSIS  Roll the platform out to many repos, one MR each (no manual per-repo work).
.DESCRIPTION
  Reads a repos.txt (one GitLab clone URL per line), clones to a temp dir, runs the
  installer, commits on a branch, pushes, and opens an MR via glab. Idempotent and resumable.
.EXAMPLE  ./rollout-fleet.ps1 -ReposFile .\repos.txt -Mode both -WorkDir C:\fleet
#>
param(
  [Parameter(Mandatory)][string]$ReposFile,
  [ValidateSet('claude','copilot','both')][string]$Mode = 'both',
  [string]$WorkDir = (Join-Path $env:TEMP 'ai-platform-fleet'),
  [string]$Branch = 'chore/ai-platform-v3'
)
. (Join-Path $PSScriptRoot '..\install\_common.ps1')
$installer = Join-Path $PSScriptRoot "..\install\install-$Mode.ps1"
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$repos = Get-Content $ReposFile | Where-Object { $_ -and -not $_.StartsWith('#') }
$ok = 0; $fail = @()

foreach ($url in $repos) {
  $name = ($url -split '/')[-1] -replace '\.git$',''
  $dir  = Join-Path $WorkDir $name
  Write-Step "[$name]"
  try {
    if (-not (Test-Path $dir)) { git clone $url $dir } else { git -C $dir pull --ff-only }
    git -C $dir checkout -B $Branch
    & $installer -RepoPath $dir
    git -C $dir add .claude .github
    git -C $dir commit -m "chore: adopt Enterprise AI Platform v$(Get-PlatformVersion (Split-Path $PSScriptRoot -Parent)) ($Mode)" 2>$null
    git -C $dir push -u origin $Branch --force-with-lease
    if (Get-Command glab -ErrorAction SilentlyContinue) {
      glab mr create -R $url --source-branch $Branch --title "Adopt Enterprise AI Platform v3" --description "Automated rollout. Review .claude/CLAUDE.md and .github/ai-platform/REPO.md boundaries." --yes
    } else { Write-Warn2 "glab not found - branch pushed, open MR manually" }
    $ok++; Write-Ok "$name done"
  } catch { $fail += $name; Write-Warn2 "$name FAILED: $_" }
}
Write-Host ""
Write-Step "Rollout: $ok succeeded, $($fail.Count) failed"
if ($fail) { $fail | ForEach-Object { Write-Warn2 $_ } }
