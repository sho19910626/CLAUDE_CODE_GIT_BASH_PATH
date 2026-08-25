@echo off
rem ===================================================
rem  Sales CRM launcher (standalone)
rem  Double-click this file to start the app.
rem  Keep the window open while you use the app.
rem ===================================================

cd /d "%~dp0"
title Sales CRM - keep this window open

if not exist "package.json" (
  echo [ERROR] package.json not found next to this file.
  echo Put start-sales.bat in the sales-crm folder.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env not found.
  echo.
  echo   1^) copy .env.example .env
  echo   2^) open .env and set DATABASE_URL and APP_PASSWORD
  echo.
  echo   This tool keeps customer data in a shared database only,
  echo   so DATABASE_URL is required even on your own PC.
  echo.
  pause
  exit /b 1
)

rem Both values are required. Without them nobody can log in.
findstr /b /c:"DATABASE_URL=postgres" .env >nul
if errorlevel 1 (
  echo [ERROR] DATABASE_URL is not set in .env
  echo.
  echo   Open .env and paste the connection string from Neon.
  echo   See README.md for how to get one ^(free plan is enough^).
  echo.
  pause
  exit /b 1
)

findstr /b /r /c:"APP_PASSWORD=.........." .env >nul
if errorlevel 1 (
  echo [ERROR] APP_PASSWORD is not set in .env
  echo.
  echo   Make one with this command, then paste it into .env:
  echo     node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  echo.
  pause
  exit /b 1
)

rem Another server on port 3003 breaks this one. Stop before that happens.
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
