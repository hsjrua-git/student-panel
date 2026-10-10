# ==========================================================================
#  Student Panel - launcher (PowerShell).
#
#  Single-user build with an embedded database (PGlite): nothing to install or
#  run alongside it. The first launch sets things up (dependencies, the
#  database, and a one-time build) and takes a few minutes; later launches are
#  quick. Keep this window open while you use the app - closing it stops the
#  server.
#
#  Requires Node.js 20 or newer (https://nodejs.org). If double-clicking is
#  blocked, right-click this file and choose "Run with PowerShell", or run:
#    powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
# ==========================================================================
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host 'Node.js was not found. Please install Node.js 20 or newer from'
  Write-Host 'https://nodejs.org and then run this again.'
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}

node (Join-Path $PSScriptRoot 'scripts\launch.mjs')
