@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is required to run the automated tests.
  exit /b 1
)
node --check assets\relationship-routing.js || exit /b 1
node --check assets\zwds.js || exit /b 1
node --check assets\zwds-engine-adapter.js || exit /b 1
node --check assets\zwds-time-state.js || exit /b 1
node --check assets\zwds-view-model.js || exit /b 1
node tests\test-relationships.js || exit /b 1
node tests\test-routing.js || exit /b 1
node tests\test-static.js || exit /b 1
echo.
echo ALL TESTS PASSED
