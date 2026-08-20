@echo off
rem ===================================================
rem  note Studio setup + launcher
rem
rem  Double-click this file.
rem  It asks for 2 keys, writes .env, installs and starts.
rem  Keep the window open while you use the app.
rem ===================================================

cd /d "%~dp0"
title note Studio - keep this window open

if not exist "setup.ps1" (
  echo [ERROR] setup.ps1 not found next to this file.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

if errorlevel 1 (
  echo.
  echo Setup did not finish.
  pause
)
