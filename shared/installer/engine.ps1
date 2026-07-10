# shared/installer/engine.ps1
# Enterprise AI Platform — Shared Installer Engine (v3.1)
# Dot-sourced by adapter-specific install scripts (adapters/claude/install.ps1 etc.)
# Implements: idempotency, .prev backups, marker injection, hash writing, .platform-version update.
# See shared/installer/STRATEGY.md for rationale.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Path helpers ─────────────────────────────────────────────────────────────

function Get-PlatformRoot {
  # Walk up from this script to find the repo root (contains VERSION file)
  $dir = $PSScriptRoot
  while ($dir -and -not (Test-Path (Join-Path $dir 'VERSION'))) {
    $dir = Split-Path $dir -Parent
  }
  if (-not $dir) { throw "Cannot locate platform root (VERSION file not found above $PSScriptRoot)" }
  return $dir
}

function Get-PlatformVersion([string]$root) {
  $vf = Join-Path $root 'VERSION'
  if (Test-Path $vf) { return (Get-Content $vf -Raw).Trim() } else { return 'unknown' }
}

# ── Output helpers ────────────────────────────────────────────────────────────

function Write-Step([string]$msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)    { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Skip([string]$msg)  { Write-Host "  --  $msg (unchanged)" -ForegroundColor DarkGray }
function Write-Warn2([string]$msg) { Write-Host "  !   $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg)  { Write-Host "  ERR $msg" -ForegroundColor Red }
function Write-Dry([string]$msg)   { Write-Host "  DRY $msg" -ForegroundColor Magenta }

# ── Idempotency: hash-based change detection ──────────────────────────────────

function Get-FileHashHex([string]$path) {
  if (-not (Test-Path $path)) { return $null }
  return (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLower()
}

function Get-StringHashHex([string]$text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $sha   = [System.Security.Cryptography.SHA256]::Create()
  return ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
}

# ── .prev backup ──────────────────────────────────────────────────────────────

function Backup-File([string]$path) {
  # TK-037: create .prev backup before overwriting any installed file
  if (Test-Path $path) {
    $prevPath = "$path.prev"
    Copy-Item $path $prevPath -Force
    Write-Ok "Backed up: $([System.IO.Path]::GetFileName($path)) -> .prev"
    return $true
  }
  return $false
}

# ── Direct file copy (idempotent) ─────────────────────────────────────────────

function Install-FileCopy {
  param(
    [string]$Source,
    [string]$Target,
    [switch]$NoBackup,
    [switch]$Force
  )
  $sourceContent = Get-Content $Source -Raw
  $sourceHash    = Get-StringHashHex $sourceContent

  if (Test-Path $Target) {
    $targetHash = Get-StringHashHex (Get-Content $Target -Raw)
    if (-not $Force -and $sourceHash -eq $targetHash) {
      Write-Skip $Target
      return $false  # no change
    }
    if (-not $NoBackup) { Backup-File $Target }
  } else {
    $targetDir = Split-Path $Target -Parent
    if ($targetDir) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
  }

  Set-Content -Path $Target -Value $sourceContent -Encoding utf8
  Write-Ok "Installed: $Target"
  return $true
}

# ── Recursive directory copy (idempotent) ─────────────────────────────────────

function Install-DirectoryCopy {
  param(
    [string]$Source,
    [string]$Target,
    [switch]$Force
  )
  if (-not (Test-Path $Source)) { throw "Source directory not found: $Source" }
  New-Item -ItemType Directory -Force -Path $Target | Out-Null

  $changed = 0
  Get-ChildItem -Path $Source -File -Recurse | ForEach-Object {
    $rel    = $_.FullName.Substring($Source.Length).TrimStart('\', '/')
    $dst    = Join-Path $Target $rel
    $dstDir = Split-Path $dst -Parent
    if ($dstDir) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
    if (Install-FileCopy -Source $_.FullName -Target $dst -Force:$Force) { $changed++ }
  }
  return $changed
}

# ── Marker injection ──────────────────────────────────────────────────────────

function Install-MarkerInject {
  param(
    [string]$SourceFile,       # e.g. shared/contract.md
    [string]$TargetFile,       # e.g. ~/.claude/CLAUDE.md
    [string]$StartMarker,      # e.g. enterprise-ai-platform:contract:start
    [string]$EndMarker,        # e.g. enterprise-ai-platform:contract:end
    [string]$KernelMarkerStart = $null,  # if set, extract only this sub-section
    [string]$KernelMarkerEnd   = $null
  )

  $sourceContent = Get-Content $SourceFile -Raw

  # If kernel markers specified, extract just the kernel section
  $injectContent = $sourceContent
  if ($KernelMarkerStart -and $KernelMarkerEnd) {
    $si = $sourceContent.IndexOf($KernelMarkerStart)
    $ei = $sourceContent.IndexOf($KernelMarkerEnd)
    if ($si -lt 0 -or $ei -lt 0) {
      throw "Kernel markers not found in $SourceFile"
    }
    $injectContent = $sourceContent.Substring($si, $ei - $si + $KernelMarkerEnd.Length)
  }

  $startTag = "<!-- $StartMarker -->"
  $endTag   = "<!-- $EndMarker -->"

  if (Test-Path $TargetFile) {
    $existing = Get-Content $TargetFile -Raw
    if ($existing -match [regex]::Escape($startTag)) {
      # Replace in-markers (idempotent update)
      $newSection  = "$startTag`n$injectContent`n$endTag"
      $pattern     = '(?s)' + [regex]::Escape($startTag) + '.*?' + [regex]::Escape($endTag)
      $newExisting = $existing -replace $pattern, $newSection

      $oldHash = Get-StringHashHex $existing
      $newHash = Get-StringHashHex $newExisting
      if ($oldHash -eq $newHash) {
        Write-Skip "$TargetFile (markers)"
        return $false
      }

      Backup-File $TargetFile
      Set-Content $TargetFile $newExisting -Encoding utf8
      Write-Ok "Updated markers in: $TargetFile"
      return $true
    } else {
      # Append markers (first-time inject)
      Backup-File $TargetFile
      $append = "`n`n$startTag`n$injectContent`n$endTag"
      Add-Content $TargetFile $append -Encoding utf8
      Write-Ok "Injected markers into: $TargetFile"
      return $true
    }
  } else {
    # Create new file with markers
    $targetDir = Split-Path $TargetFile -Parent
    if ($targetDir) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
    $content = "$startTag`n$injectContent`n$endTag"
    Set-Content $TargetFile $content -Encoding utf8
    Write-Ok "Created: $TargetFile"
    return $true
  }
}

# ── .ai/ directory and hash management ───────────────────────────────────────

function Ensure-AiDirectory([string]$repoPath) {
  $aiDir = Join-Path $repoPath '.ai'
  New-Item -ItemType Directory -Force -Path $aiDir | Out-Null

  # Add runtime-only .ai/ entries to .gitignore
  $gitignore = Join-Path $repoPath '.gitignore'
  $entries   = @('.ai/.session-verified', '.ai/.contract-hash', '.ai/.standards-hash')
  $needed    = @()
  $existing  = if (Test-Path $gitignore) { Get-Content $gitignore -Raw } else { '' }
  foreach ($entry in $entries) {
    if ($existing -notmatch [regex]::Escape($entry)) { $needed += $entry }
  }
  if ($needed.Count -gt 0) {
    $block = "`n# AI Platform -- runtime-only (do not commit)`n" + ($needed -join "`n")
    Add-Content $gitignore $block -Encoding utf8
    Write-Ok "Added .ai/ runtime entries to .gitignore"
  }
  return $aiDir
}

function Write-ContractHash([string]$aiDir, [string]$platformRoot) {
  $sha256File = Join-Path $platformRoot 'shared\contract.md.sha256'
  if (-not (Test-Path $sha256File)) {
    Write-Warn2 "shared/contract.md.sha256 not found -- skipping contract hash write"
    return
  }
  $hash   = (Get-Content $sha256File -Raw).Trim()
  $target = Join-Path $aiDir '.contract-hash'
  Set-Content $target $hash -Encoding utf8 -NoNewline
  Write-Ok "Written: .ai/.contract-hash"
}

# ── TK-038: .platform-version.json update ────────────────────────────────────

function Update-PlatformVersion {
  param(
    [string]$RepoPath,
    [string]$PlatformVersion,
    [string]$AdapterName,
    [string]$AdapterVersion,
    [hashtable]$Features = @{},
    [hashtable]$Hashes   = @{}
  )

  $targetPath = Join-Path $RepoPath '.ai\.platform-version.json'
  $now        = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

  # Load existing or create blank record
  if (Test-Path $targetPath) {
    $record = Get-Content $targetPath -Raw | ConvertFrom-Json
    # Convert to ordered hashtable for mutation
    $rec = @{}
    $record.PSObject.Properties | ForEach-Object { $rec[$_.Name] = $_.Value }
  } else {
    $rec = @{
      version     = $PlatformVersion
      installedAt = $now
      channel     = 'stable'
      platforms   = @{}
      features    = @{}
      contractHash = ''
      standardsHashes = @{}
    }
  }

  $rec['version']     = $PlatformVersion
  $rec['installedAt'] = $now

  # Update platform entry
  if (-not $rec['platforms']) { $rec['platforms'] = @{} }
  if ($rec['platforms'] -is [System.Management.Automation.PSCustomObject]) {
    $platformsHash = @{}
    $rec['platforms'].PSObject.Properties | ForEach-Object { $platformsHash[$_.Name] = $_.Value }
    $rec['platforms'] = $platformsHash
  }
  $rec['platforms'][$AdapterName] = @{
    installed      = $true
    adapterVersion = $AdapterVersion
    settingsHash   = $Hashes['settings']
  }

  # Merge feature flags (true-only — never revert a true to false here)
  if (-not $rec['features']) { $rec['features'] = @{} }
  if ($rec['features'] -is [System.Management.Automation.PSCustomObject]) {
    $featHash = @{}
    $rec['features'].PSObject.Properties | ForEach-Object { $featHash[$_.Name] = $_.Value }
    $rec['features'] = $featHash
  }
  foreach ($k in $Features.Keys) {
    if ($Features[$k] -eq $true) { $rec['features'][$k] = $true }
  }

  # Update contract hash if provided
  if ($Hashes['contract']) { $rec['contractHash'] = $Hashes['contract'] }

  # Write
  $aiDir = Join-Path $RepoPath '.ai'
  New-Item -ItemType Directory -Force -Path $aiDir | Out-Null
  $rec | ConvertTo-Json -Depth 5 | Set-Content -Path $targetPath -Encoding utf8
  Write-Ok "Updated: .ai/.platform-version.json (v$PlatformVersion, adapter=$AdapterName)"
}

# ── Convenience: read contract hash ──────────────────────────────────────────

function Get-ContractKernelHash([string]$contractPath) {
  if (-not (Test-Path $contractPath)) { return $null }
  $content = Get-Content $contractPath -Raw
  $start   = '<!-- enterprise-ai-platform:kernel:start -->'
  $end     = '<!-- enterprise-ai-platform:kernel:end -->'
  $si = $content.IndexOf($start)
  $ei = $content.IndexOf($end)
  if ($si -lt 0 -or $ei -lt 0) { return $null }
  $kernel = $content.Substring($si, $ei - $si + $end.Length)
  return Get-StringHashHex $kernel
}
