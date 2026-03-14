@echo off
REM Author: Tarun Vangari (tarun.vangari@gmail.com) | ADLC-Agent-Kit | 2026-03-14
echo ============================================
echo  Team Panchayat - ADLC Workspace Setup
echo ============================================
echo.

set ROOT=%USERPROFILE%\TeamPanchayat
set DOWNLOADS=%USERPROFILE%\Downloads

echo Project root: %ROOT%
echo Source files: %DOWNLOADS%
echo.

REM ── Create folders one by one (safe on all Windows versions) ─
echo [1/6] Creating project folders...
if not exist "%ROOT%"                          mkdir "%ROOT%"
if not exist "%ROOT%\infra"                    mkdir "%ROOT%\infra"
if not exist "%ROOT%\infra\modules"            mkdir "%ROOT%\infra\modules"
if not exist "%ROOT%\infra\modules\s3"         mkdir "%ROOT%\infra\modules\s3"
if not exist "%ROOT%\infra\modules\cloudwatch" mkdir "%ROOT%\infra\modules\cloudwatch"
if not exist "%ROOT%\infra\modules\iam"        mkdir "%ROOT%\infra\modules\iam"
if not exist "%ROOT%\backend"                  mkdir "%ROOT%\backend"
if not exist "%ROOT%\backend\app"              mkdir "%ROOT%\backend\app"
if not exist "%ROOT%\backend\app\routers"      mkdir "%ROOT%\backend\app\routers"
if not exist "%ROOT%\backend\app\schemas"      mkdir "%ROOT%\backend\app\schemas"
if not exist "%ROOT%\backend\migrations"       mkdir "%ROOT%\backend\migrations"
if not exist "%ROOT%\backend\tests"            mkdir "%ROOT%\backend\tests"
if not exist "%ROOT%\frontend"                 mkdir "%ROOT%\frontend"
if not exist "%ROOT%\frontend\src"             mkdir "%ROOT%\frontend\src"
if not exist "%ROOT%\frontend\src\components"  mkdir "%ROOT%\frontend\src\components"
if not exist "%ROOT%\frontend\src\tokens"      mkdir "%ROOT%\frontend\src\tokens"
if not exist "%ROOT%\docs"                     mkdir "%ROOT%\docs"
if not exist "%ROOT%\agent-logs"               mkdir "%ROOT%\agent-logs"
if not exist "%ROOT%\prompts"                  mkdir "%ROOT%\prompts"
echo     Folders OK.

REM ── Copy files ───────────────────────────────────────────────
echo.
echo [2/6] Copying CLAUDE.md...
copy "%DOWNLOADS%\CLAUDE.md" "%ROOT%\CLAUDE.md" >nul 2>&1 && echo     OK || echo     SKIPPED

echo [3/6] Copying agent-status.json...
copy "%DOWNLOADS%\agent-status.json" "%ROOT%\agent-status.json" >nul 2>&1 && echo     OK || echo     SKIPPED

echo [4/6] Copying sync-dashboard.js...
copy "%DOWNLOADS%\sync-dashboard.js" "%ROOT%\sync-dashboard.js" >nul 2>&1 && echo     OK || echo     SKIPPED

echo [5/6] Copying sprint-dashboard.html...
copy "%DOWNLOADS%\sprint-dashboard.html" "%ROOT%\sprint-dashboard.html" >nul 2>&1 && echo     OK || echo     SKIPPED

echo [6/6] Copying agent prompt files...
if exist "%DOWNLOADS%\prompts\" (
    xcopy "%DOWNLOADS%\prompts\*" "%ROOT%\prompts\" /Y /Q >nul 2>&1
    echo     OK
) else (
    echo     SKIPPED - prompts folder not found
)

echo.
echo ============================================
echo  Setup complete!
echo  Project is ready at: %ROOT%
echo ============================================
echo.
echo  Next: double-click start-agents.bat
echo.
pause
