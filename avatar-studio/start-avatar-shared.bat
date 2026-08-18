@echo off
rem ===================================================
rem  Avatar Studio - shared mode
rem  Runs the app so other people on the same office
rem  network can use it from their own browser.
rem  Keep this window open while the team is using it.
rem ===================================================

cd /d "%~dp0"
title Avatar Studio (shared) - keep this window open

if not exist "package.json" (
  echo [ERROR] package.json not found next to this file.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env not found.
  echo   1^) copy .env.example .env
  echo   2^) open .env and set ANTHROPIC_API_KEY
  pause
  exit /b 1
)

netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] Port 3001 is already in use.
  echo   Close the other black window, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies. First run takes a few minutes...
  call npm install
)

echo.
echo Building for shared use. This takes a minute...
if exist ".next" rmdir /s /q ".next"
call npm run build

node lan-url.js
start "" /b node open-avatar.js
call npm start -- -H 0.0.0.0

echo.
echo Server stopped.
pause
