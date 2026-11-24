@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Apartment Studio needs Node.js 22 or later.
  echo Install the Windows LTS version from https://nodejs.org/ and reopen this file.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo Update Node.js to version 22 or later, then reopen this file.
  pause
  exit /b 1
)
node local/server.mjs
if errorlevel 1 pause
