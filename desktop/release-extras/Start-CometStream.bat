@echo off
setlocal EnableExtensions
title CometStream Launcher
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "NODE_EXE=%ROOT%\runtime\node.exe"
if not exist "%NODE_EXE%" (
  echo [ERROR] runtime\node.exe not found - the portable bundle is incomplete.
  pause
  exit /b 1
)

rem All data (database, documents, settings) lives inside this folder:
rem   server\storage   - move the whole folder to move the app + data.
set "NODE_ENV=production"
set "STORAGE_DIR=%ROOT%\server\storage"
set "PUPPETEER_CACHE_DIR=%ROOT%\runtime\chrome"
if not exist "%STORAGE_DIR%" mkdir "%STORAGE_DIR%"

echo [1/4] Preparing database (generate client + apply migrations)...
pushd "%ROOT%\server"
"%NODE_EXE%" node_modules\prisma\build\index.js generate --schema=./prisma/schema.prisma
if errorlevel 1 goto :fail
"%NODE_EXE%" node_modules\prisma\build\index.js migrate deploy --schema=./prisma/schema.prisma
if errorlevel 1 goto :fail
popd

echo [2/4] Starting document collector on port 8888...
pushd "%ROOT%\collector"
start "CometStream Collector" /min "%NODE_EXE%" index.js
popd

echo [3/4] Starting CometStream server on port 3001...
pushd "%ROOT%\server"
start "CometStream Server" /min "%NODE_EXE%" index.js
popd

echo      Waiting for the server to come online...
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest -UseBasicParsing http://localhost:3001 -TimeoutSec 2 | Out-Null; exit 0}catch{Start-Sleep 1}}; exit 1" >nul 2>&1

echo [4/4] Opening http://localhost:3001 in your browser...
start "" http://localhost:3001
echo.
echo CometStream is running.
echo - Close the two minimized "CometStream Server/Collector" windows to stop it, or run Stop-CometStream.bat
timeout /t 10 >nul
exit /b 0

:fail
popd 2>nul
echo.
echo [ERROR] Startup failed - see the messages above.
pause
exit /b 1
