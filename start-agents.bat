@echo off
REM Agent: Launcher | Sprint: 01 | Date: 2026-03-21
REM ============================================================
REM Team Panchayat -- ADLC Launcher v3.3 (BAT-only, no PS1)
REM Author: Tarun Vangari (tarun.vangari@gmail.com)
REM
REM Usage:
REM   start-agents.bat                              -- interactive (manual paste)
REM   start-agents.bat autorun                      -- AUTO-RUN (compile + parallel)
REM   start-agents.bat autorun vikram               -- auto-run one agent only
REM   start-agents.bat project "projects\REQ-xxx"   -- run against specific project
REM   start-agents.bat project "projects\REQ-xxx" autorun
REM   start-agents.bat new                          -- create new requirement (wizard)
REM   start-agents.bat list                         -- list all projects
REM   start-agents.bat switch "projects\REQ-xxx"    -- switch active project
REM   start-agents.bat compile                      -- pre-compile contexts only
REM   start-agents.bat tokens                       -- show token audit stats
REM ============================================================
setlocal enabledelayedexpansion

REM ---- Resolve KITROOT (folder this bat lives in) -----------------------------
set "KITROOT=%~dp0"
if "%KITROOT:~-1%"=="\" set "KITROOT=%KITROOT:~0,-1%"

echo ============================================================
echo  Team Panchayat -- ADLC Launcher v3.3 (BAT-only)
echo  Kit: %KITROOT%
echo ============================================================
echo.

REM ---- Sanity: claude CLI -----------------------------------------------------
where claude >nul 2>&1
if errorlevel 1 (
    echo ERROR: 'claude' command not found.
    echo Install it:  npm install -g @anthropic-ai/claude-code
    pause
    exit /b 1
)

REM ---- Sanity: Node.js --------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Download from https://nodejs.org
    pause
    exit /b 1
)

REM ---- Sanity: helper bat present ---------------------------------------------
if not exist "%KITROOT%\_run-agent.bat" (
    echo ERROR: _run-agent.bat not found in %KITROOT%
    echo Make sure all kit files are in the same folder.
    pause
    exit /b 1
)

REM ---- Resolve PROJECTROOT from active-project.json --------------------------
set "PROJECTROOT=%KITROOT%"
pushd "%KITROOT%"
for /f "delims=" %%R in ('node -e "try{var ap=require('./active-project.json');var r=(ap.current||'.');if(r!=='.')process.stdout.write(r);}catch(e){}" 2^>nul') do set "_REL=%%R"
popd
if not "!_REL!"=="" set "PROJECTROOT=%KITROOT%\!_REL!"

echo  Project: %PROJECTROOT%
echo.

REM ============================================================
REM  COMMAND ROUTING
REM ============================================================

REM -- new requirement wizard ---------------------------------------------------
if /i "%1"=="new" (
    echo Creating new requirement...
    pushd "%KITROOT%"
    node new-project.js
    if errorlevel 1 (
        echo.
        echo ERROR: new-project.js failed. Check Node.js is installed.
        popd
        pause
        exit /b 1
    )
    popd
    pause
    goto :eof
)

REM -- list all projects --------------------------------------------------------
if /i "%1"=="list" (
    pushd "%KITROOT%"
    node new-project.js --list
    popd
    pause
    exit /b 0
)

REM -- switch active project ----------------------------------------------------
if /i "%1"=="switch" (
    if "%~2"=="" (
        echo Usage: start-agents.bat switch "projects\REQ-xxx-name"
        pause
        exit /b 1
    )
    pushd "%KITROOT%"
    node new-project.js --switch "%~2"
    popd
    pause
    exit /b 0
)

REM -- compile contexts only (no agents) ----------------------------------------
if /i "%1"=="compile" (
    echo Pre-compiling agent contexts...
    pushd "%KITROOT%"
    node context-compiler.js
    popd
    echo Done. Context files written to context\
    pause
    exit /b 0
)

REM -- token audit stats --------------------------------------------------------
if /i "%1"=="tokens" (
    pushd "%KITROOT%"
    node context-compiler.js --stats
    popd
    pause
    exit /b 0
)

REM -- run against a specific project folder ------------------------------------
if /i "%1"=="project" (
    if "%~2"=="" (
        echo Usage: start-agents.bat project "projects\REQ-xxx-name" [autorun]
        pause
        exit /b 1
    )
    pushd "%KITROOT%"
    node new-project.js --switch "%~2"
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to switch project. Check the path and try again.
        popd
        pause
        exit /b 1
    )
    popd
    set "PROJECTROOT=%KITROOT%\%~2"
    if /i "%~3"=="autorun" goto :launch_autorun
    goto :launch_interactive
)

REM -- autorun (compile + parallel launch) -------------------------------------
if /i "%1"=="autorun" goto :compile_and_autorun

REM -- default: interactive mode -----------------------------------------------
goto :launch_interactive


REM ============================================================
:compile_and_autorun
echo   [COMPILE] Pre-compiling agent contexts...
pushd "%KITROOT%"
node context-compiler.js --stats
popd
echo   [COMPILE] Done.
echo.
goto :launch_autorun


REM ============================================================
:launch_dashboard
REM Start the dashboard server window
echo   [DASH] Starting Dashboard Server on :3000...
start "ADLC-Dashboard" cmd /k ""%KITROOT%\_run-agent.bat" "dashboard" "-" "server" "%KITROOT%" "%KITROOT%" "2F""
timeout /t 2 /nobreak >nul

REM Start the group-chat viewer window
echo   [CHAT] Starting Group Chat Viewer...
start "ADLC-GroupChat" cmd /k ""%KITROOT%\_run-agent.bat" "chat" "-" "chatviewer" "%PROJECTROOT%" "%KITROOT%" "07""
timeout /t 1 /nobreak >nul
goto :eof


REM ============================================================
:launch_interactive
echo   INTERACTIVE MODE -- paste prompts manually in each window.
echo.

call :launch_dashboard

echo   [1/6] Arjun...
call :start_agent arjun  claude-opus-4-6             interactive
timeout /t 1 /nobreak >nul

echo   [2/6] Vikram...
call :start_agent vikram claude-sonnet-4-6            interactive
timeout /t 1 /nobreak >nul

echo   [3/6] Rasool...
call :start_agent rasool claude-sonnet-4-6            interactive
timeout /t 1 /nobreak >nul

echo   [4/6] Kavya...
call :start_agent kavya  claude-haiku-4-5-20251001    interactive
timeout /t 1 /nobreak >nul

echo   [5/6] Kiran...
call :start_agent kiran  claude-sonnet-4-6            interactive
timeout /t 1 /nobreak >nul

echo   [6/6] Rohan...
call :start_agent rohan  claude-sonnet-4-6            interactive

echo.
echo ============================================================
echo   All 6 windows launched (interactive mode)!
echo.
echo   PASTE PROMPTS IN THIS ORDER:
echo     Phase 1 (all at once):
echo       ARJUN   ^<- prompts\arjun-prompt.txt
echo       VIKRAM  ^<- prompts\vikram-prompt.txt
echo       RASOOL  ^<- prompts\rasool-prompt.txt
echo       KAVYA   ^<- prompts\kavya-prompt.txt
echo     Phase 2 (after Rasool + Kavya done):
echo       KIRAN   ^<- prompts\kiran-prompt.txt
echo       ROHAN   ^<- prompts\rohan-prompt.txt
echo     Phase 3 (after ALL 5 build agents done):
echo       KEERTHI ^<- prompts\keerthi-prompt.txt
echo.
echo   Dashboard: http://localhost:3000
echo ============================================================

start http://localhost:3000

echo.
echo Press Enter to close this launcher...
pause >nul
goto :eof


REM ============================================================
:launch_autorun
echo   AUTORUN MODE -- launching agents in parallel...
echo.

call :launch_dashboard

REM Pre-compile contexts before launching agents
pushd "%KITROOT%"
node context-compiler.js --stats 2>&1
popd
echo.

if not "%~2"=="" (
    REM Single-agent mode
    echo   Launching single agent: %~2
    call :start_agent "%~2" "" autorun
    echo.
    echo ============================================================
    echo   Agent %~2 launched in AUTORUN mode.
    echo   Dashboard: http://localhost:3000
    echo ============================================================
) else (
    REM Phase 1 (true parallel)
    echo   Phase 1 (parallel): Arjun, Vikram, Rasool, Kavya
    call :start_agent arjun  claude-opus-4-6          autorun
    call :start_agent vikram claude-sonnet-4-6         autorun
    call :start_agent rasool claude-sonnet-4-6         autorun
    call :start_agent kavya  claude-haiku-4-5-20251001 autorun

    echo.
    echo   Phase 1 launched. Phase 2 starts in 15 seconds...
    timeout /t 15 /nobreak

    REM Phase 2
    echo.
    echo   Phase 2: Kiran, Rohan
    call :start_agent kiran  claude-sonnet-4-6         autorun
    call :start_agent rohan  claude-sonnet-4-6         autorun

    echo.
    echo ============================================================
    echo   All agents launched in AUTORUN mode!
    echo   Dashboard: http://localhost:3000
    echo   Keerthi activates after all 5 build agents are DONE.
    echo ============================================================
)

start http://localhost:3000

echo.
echo Press Enter to close this launcher...
pause >nul
goto :eof


REM ============================================================
REM Subroutine: start_agent
REM   %1 = agent name
REM   %2 = model (pass "" in autorun to auto-resolve from name)
REM   %3 = mode  (interactive | autorun)
REM
REM Color codes per agent:
REM   ARJUN   5F  (DarkMagenta bg / White fg)
REM   VIKRAM  4F  (DarkRed bg    / White fg)
REM   RASOOL  60  (Yellow bg     / Black fg)
REM   KAVYA   5F  (DarkMagenta bg/ White fg)
REM   KIRAN   3F  (Aqua bg       / White fg)
REM   ROHAN   1F  (Blue bg       / White fg)
REM   KEERTHI 07  (Black bg      / Gray fg)
REM ============================================================
:start_agent
set "_AN=%~1"
set "_MDL=%~2"
set "_MD=%~3"

REM Auto-resolve model if not supplied
if "!_MDL!"=="" (
    set "_MDL=claude-sonnet-4-6"
    if /i "!_AN!"=="arjun"   set "_MDL=claude-opus-4-6"
    if /i "!_AN!"=="kavya"   set "_MDL=claude-haiku-4-5-20251001"
    if /i "!_AN!"=="keerthi" set "_MDL=claude-haiku-4-5-20251001"
)

REM Resolve color
set "_CLR=1F"
if /i "!_AN!"=="arjun"   set "_CLR=5F"
if /i "!_AN!"=="vikram"  set "_CLR=4F"
if /i "!_AN!"=="rasool"  set "_CLR=60"
if /i "!_AN!"=="kavya"   set "_CLR=5F"
if /i "!_AN!"=="kiran"   set "_CLR=3F"
if /i "!_AN!"=="rohan"   set "_CLR=1F"
if /i "!_AN!"=="keerthi" set "_CLR=07"

REM Resolve display title
set "_TIT=!_AN!-Agent"
if /i "!_AN!"=="arjun"   set "_TIT=ARJUN-Orchestrator"
if /i "!_AN!"=="vikram"  set "_TIT=VIKRAM-CloudArchitect"
if /i "!_AN!"=="rasool"  set "_TIT=RASOOL-DatabaseAgent"
if /i "!_AN!"=="kavya"   set "_TIT=KAVYA-UXDesigner"
if /i "!_AN!"=="kiran"   set "_TIT=KIRAN-BackendEngineer"
if /i "!_AN!"=="rohan"   set "_TIT=ROHAN-FrontendEngineer"
if /i "!_AN!"=="keerthi" set "_TIT=KEERTHI-QA"

echo   [!_TIT!] ^(!_MDL!^) [!_MD!]...
start "!_TIT!" cmd /k ""%KITROOT%\_run-agent.bat" "!_AN!" "!_MDL!" "!_MD!" "%PROJECTROOT%" "%KITROOT%" "!_CLR!""
goto :eof
