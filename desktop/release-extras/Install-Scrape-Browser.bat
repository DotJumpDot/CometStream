@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "NODE_EXE=%ROOT%\runtime\node.exe"
set "PUPPETEER_CACHE_DIR=%ROOT%\runtime\chrome"

if not exist "%NODE_EXE%" (
  echo [ERROR] runtime\node.exe not found - the portable bundle is incomplete.
  pause
  exit /b 1
)
if not exist "%ROOT%\collector\node_modules\puppeteer\install.mjs" (
  echo [ERROR] collector\node_modules\puppeteer\install.mjs not found.
  pause
  exit /b 1
)

echo Downloading Chromium for the website-scraping collector feature...
echo This is OPTIONAL - only needed if you scrape websites into workspaces.
echo (~300 MB will be downloaded into runtime\chrome)
echo.
pushd "%ROOT%\collector"
"%NODE_EXE%" node_modules\puppeteer\install.mjs
set "EC=%errorlevel%"
popd
if not "%EC%"=="0" (
  echo [ERROR] Browser install failed - see messages above.
  pause
  exit /b 1
)
echo.
echo Done. Website scraping is now available offline.
pause
