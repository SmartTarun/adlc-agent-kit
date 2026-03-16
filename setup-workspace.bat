@echo off
REM ============================================================
REM Author: Tarun Vangari (tarun.vangari@gmail.com)
REM ADLC-Agent-Kit | Team Panchayat -- Workspace Setup
REM Run once before starting agents for the first time.
REM ============================================================

REM FIX: Use %~dp0 (this bat file's own folder) as ROOT.
REM      Previously used %USERPROFILE%\TeamPanchayat which was wrong.
REM      The kit runs IN-PLACE from wherever you placed it.
set ROOT=%~dp0
REM Remove trailing backslash that %~dp0 always adds
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%

echo ============================================================
echo  Team Panchayat - ADLC Workspace Setup
echo  Kit folder: %ROOT%
echo ============================================================
echo.

REM -- Create project sub-folders inside the kit directory ----------------------
echo [1/7] Creating project sub-folders...
if not exist "%ROOT%\infra"                    mkdir "%ROOT%\infra"
if not exist "%ROOT%\infra\modules"            mkdir "%ROOT%\infra\modules"
if not exist "%ROOT%\infra\modules\s3"         mkdir "%ROOT%\infra\modules\s3"
if not exist "%ROOT%\infra\modules\cloudwatch" mkdir "%ROOT%\infra\modules\cloudwatch"
if not exist "%ROOT%\infra\modules\iam"        mkdir "%ROOT%\infra\modules\iam"
if not exist "%ROOT%\infra\modules\ecs"        mkdir "%ROOT%\infra\modules\ecs"
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
if not exist "%ROOT%\agent-memory"             mkdir "%ROOT%\agent-memory"
if not exist "%ROOT%\prompts"                  mkdir "%ROOT%\prompts"
echo     Folders OK.

REM -- Initialise agent-status.json if missing ----------------------------------
echo.
echo [2/7] Checking agent-status.json...
if not exist "%ROOT%\agent-status.json" (
    echo {} > "%ROOT%\agent-status.json"
    echo     Created agent-status.json
) else (
    echo     Already exists -- skipped
)

REM -- Initialise group-chat.json if missing ------------------------------------
echo.
echo [3/7] Checking group-chat.json...
if not exist "%ROOT%\group-chat.json" (
    echo [] > "%ROOT%\group-chat.json"
    echo     Created group-chat.json
) else (
    echo     Already exists -- skipped
)

REM -- Initialise requirement.json if missing -----------------------------------
echo.
echo [4/7] Checking requirement.json...
if not exist "%ROOT%\requirement.json" (
    echo {} > "%ROOT%\requirement.json"
    echo     Created requirement.json
) else (
    echo     Already exists -- skipped
)

REM -- Initialise agent memory files if missing ---------------------------------
echo.
echo [5/7] Initialising agent memory files...
for %%A in (arjun vikram rasool kavya kiran rohan keerthi) do (
    if not exist "%ROOT%\agent-memory\%%A-memory.json" (
        echo {"agent":"%%A","sessionCount":0,"lastActive":null,"currentTask":{},"completedTasks":[],"filesCreated":[],"keyDecisions":[],"pendingNextSteps":[],"blockers":[]} > "%ROOT%\agent-memory\%%A-memory.json"
        echo     Created %%A-memory.json
    )
)

REM -- Check claude CLI ---------------------------------------------------------
echo.
echo [6/7] Checking claude CLI...
where claude >nul 2>&1
if errorlevel 1 (
    echo     WARNING: 'claude' not found in PATH.
    echo     Install it in PowerShell:
    echo       npm install -g @anthropic-ai/claude-code
) else (
    for /f "tokens=*" %%V in ('claude --version 2^>nul') do echo     Found: %%V
)

REM -- Check Node.js ------------------------------------------------------------
echo.
echo [7/7] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo     WARNING: Node.js not found. Download from https://nodejs.org
) else (
    for /f "tokens=*" %%V in ('node --version 2^>nul') do echo     Found: %%V
)

echo.
echo ============================================================
echo  Setup complete!
echo  Kit is ready at: %ROOT%
echo.
echo  NEXT STEPS:
echo  1. Run start-agents.ps1 (in PowerShell)
echo     OR double-click start-agents.bat
echo.
echo  For Docker mode (v3):
echo     Copy .env.template to .env and add your API key
echo     Then run docker-start.ps1 in PowerShell
echo ============================================================
echo.
pause
