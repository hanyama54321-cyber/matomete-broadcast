@echo off
rem matomete-broadcast launcher for Windows.
rem Starts serve.js (local only) and opens http://localhost:8765/
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then run this file again.
  pause
  exit /b 1
)
node serve.js --open
pause
