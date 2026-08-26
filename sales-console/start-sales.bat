@echo off
rem ===================================================
rem  Shodan Navi (sales-console) launcher
rem  Double-click this file to start the app.
rem  Keep the window open while you use the app.
rem ===================================================

cd /d "%~dp0"
title Shodan Navi - keep this window open

if not exist "package.json" (
  echo [ERROR] package.json not found next to this file.
  echo Put start-sales.bat in the sales-console folder.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env not found.
  echo.
  echo   1^) copy .env.example .env
  echo   2^) open .env and set ANTHROPIC_API_KEY / APP_PASSWORD / DATABASE_URL
  echo.
  pause
  exit /b 1
)

rem Another server on port 3000 breaks this one. Stop before that happens.
netstat -ano | findstr ":3003" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] Port 3003 is already in use.
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
echo Starting server. Your browser will open automatically.
echo Close this window to stop the app.
echo.

start "" /b node open-app.js
call npm run dev

echo.
echo Server stopped.
pause
