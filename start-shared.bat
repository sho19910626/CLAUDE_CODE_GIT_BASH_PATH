@echo off
rem ===================================================
rem  Recruit Studio - shared mode
rem  Runs the app so other people on the same office
rem  network can use it from their own browser.
rem  Keep this window open while the team is using it.
rem ===================================================

cd /d "%~dp0"
title Recruit Studio (shared) - keep this window open

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

rem Another server on port 3000 breaks this one. Stop before that happens.
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] Port 3000 is already in use.
  echo.
  echo   Another black window is still running the app.
  echo   Close ALL other black windows, then run this file again.
  echo.
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
start "" /b node open-app.js
call npm start -- -H 0.0.0.0

echo.
echo Server stopped.
pause
