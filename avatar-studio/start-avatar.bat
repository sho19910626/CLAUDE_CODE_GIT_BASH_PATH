@echo off
rem ===================================================
rem  Avatar Studio launcher
rem  Double-click this file to start the app.
rem  Keep the window open while you use the app.
rem  This app runs on port 3001, so it can run at the
rem  same time as the other studio on port 3000.
rem ===================================================

cd /d "%~dp0"
title Avatar Studio - keep this window open

if not exist "package.json" (
  echo [ERROR] package.json not found next to this file.
  echo Put start-avatar.bat in the avatar-studio folder.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env not found.
  echo.
  echo   1^) copy .env.example .env
  echo   2^) open .env and set ANTHROPIC_API_KEY
  echo.
  pause
  exit /b 1
)

rem Another server on port 3001 breaks this one. Stop before that happens.
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] Port 3001 is already in use.
  echo.
  echo   Another black window is still running Avatar Studio.
  echo   Close it, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies. First run takes a few minutes...
  call npm install
)

echo.
echo Starting Avatar Studio. Your browser will open automatically.
echo Close this window to stop the app.
echo.

start "" /b node open-avatar.js
call npm run dev

echo.
echo Server stopped.
pause
