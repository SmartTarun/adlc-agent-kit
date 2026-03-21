@echo off
REM ============================================================
REM Author: Tarun Vangari (tarun.vangari@gmail.com)
REM ADLC-Agent-Kit | Team Panchayat -- Launcher v3.2 (multi-project)
REM
REM Usage:
REM   start-agents.bat                              -- interactive (manual paste)
REM   start-agents.bat autorun                      -- AUTO-RUN (compile + parallel)
REM   start-agents.bat autorun vikram               -- auto-run one agent only
REM   start-agents.bat project "projects\REQ-xxx"   -- run against specific project
REM   start-agents.bat new                          -- create new requirement (wizard)
REM   start-agents.bat list                         -- list all projects
REM   start-agents.bat switch "projects\REQ-xxx"    -- switch active project
REM   start-agents.bat compile                      -- pre-compile contexts only
REM   start-agents.bat tokens                       -- show token audit stats
REM ============================================================

echo ============================================================
echo  Team Panchayat -- ADLC Launcher v3.2 (multi-project)
echo ============================================================
echo.

if not exist "%~dp0start-agents.ps1" (
    echo ERROR: start-agents.ps1 not found.
    echo Make sure all files are in the ADLC-Agent-Kit folder.
    pause
    exit /b 1
)

REM -- new requirement wizard (creates projects\REQ-xxx subfolder + switches) -
if /i "%1"=="new" (
    echo Creating new requirement...
    node "%~dp0new-project.js"
    goto :done
)

REM -- list all projects -------------------------------------------------------
if /i "%1"=="list" (
    node "%~dp0new-project.js" --list
    pause
    exit /b 0
)

REM -- switch active project ---------------------------------------------------
if /i "%1"=="switch" (
    if "%2"=="" (
        echo Usage: start-agents.bat switch "projects\REQ-xxx-name"
        pause
        exit /b 1
    )
    node "%~dp0new-project.js" --switch "%2"
    pause
    exit /b 0
)

REM -- compile only (no agents) ------------------------------------------------
if /i "%1"=="compile" (
    echo Pre-compiling agent contexts...
    node "%~dp0context-compiler.js"
    echo Done. Context files written to context\
    pause
    exit /b 0
)

REM -- token stats -------------------------------------------------------------
if /i "%1"=="tokens" (
    node "%~dp0context-compiler.js" --stats
    pause
    exit /b 0
)

REM -- autorun against a specific project folder (auto-switches first) ---------
if /i "%1"=="project" (
    if "%2"=="" (
        echo Usage: start-agents.bat project "projects\REQ-xxx-name" [autorun]
        pause
        exit /b 1
    )
    node "%~dp0new-project.js" --switch "%2"
    if /i "%3"=="autorun" (
        powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1" -AutoRun -Project "%2"
    ) else (
        powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1" -Project "%2"
    )
    goto :done
)

REM -- autorun (compile + parallel launch) -------------------------------------
if /i "%1"=="autorun" (
    if "%2"=="" (
        powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1" -AutoRun
    ) else (
        powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1" -AutoRun -Agent "%2"
    )
    goto :done
)

REM -- interactive (default double-click) -------------------------------------
powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1"

:done
if errorlevel 1 (
    echo.
    echo PowerShell script exited with an error.
    pause
)
