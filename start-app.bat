@echo off
rem ===================================================
rem  Recruit Studio launcher
rem  Double-click this file to start the app.
rem  Keep the window open while you use the app.
rem ===================================================

cd /d "%~dp0"
title Recruit Studio - keep this window open

if not exist "package.json" (
  echo [ERROR] package.json not found next to this file.
  echo Put start-app.bat in the project folder.
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

if not exist "node_modules" (
  echo Installing dependencies. First run takes a few minutes...
  call npm install
)

echo.
echo Starting server. Your browser will open automatically.
echo Close this window to stop the app.
echo.

start "" /b node open-app.js
call npm run dev

echo.
echo Server stopped.
pause
