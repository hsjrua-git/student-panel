@echo off
REM ==========================================================================
REM  Student Panel - double-click to open.
REM
REM  Single-user build with an embedded database (PGlite): nothing to install
REM  or run alongside it. The first launch sets things up (dependencies, the
REM  database, and a one-time build), so it takes a few minutes; after that it
REM  starts quickly. Keep this window open while you use the app - closing it
REM  stops the server.
REM
REM  Requires Node.js 20 or newer (https://nodejs.org). Everything else is
REM  handled by scripts\launch.mjs.
REM ==========================================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found. Please install Node.js 20 or newer from
  echo https://nodejs.org and then double-click this file again.
  echo.
  pause
  exit /b 1
)

node "%~dp0scripts\launch.mjs"
