# Shared helpers for installer scripts. Dot-sourced by the others.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PlatformRoot { return (Split-Path $PSScriptRoot -Parent) }

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Warn2([string]$msg){ Write-Host "  ! $msg" -ForegroundColor Yellow }

function Copy-Tree([string]$src, [string]$dst) {
  if (-not (Test-Path $src)) { throw "Source not found: $src" }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
}

function Get-PlatformVersion([string]$root) {
  $vf = Join-Path $root 'VERSION'
  if (Test-Path $vf) { return (Get-Content $vf -Raw).Trim() } else { return 'unknown' }
}

function Write-VersionStamp([string]$path, [string]$version, [string]$channel) {
  $stamp = [ordered]@{ version = $version; channel = $channel; installed = (Get-Date).ToString('s') }
  $stamp | ConvertTo-Json | Set-Content -Path $path -Encoding utf8
}
