@echo off
REM ============================================================
REM Author: Tarun Vangari (tarun.vangari@gmail.com)
REM ADLC-Agent-Kit | Team Panchayat -- Sprint-01 Launcher v3.1
REM
REM Usage:
REM   start-agents.bat              -- interactive (manual paste)
REM   start-agents.bat autorun      -- AUTO-RUN recommended (compile + parallel)
REM   start-agents.bat autorun vikram  -- auto-run one agent
REM   start-agents.bat compile      -- pre-compile contexts only (no agents)
REM   start-agents.bat tokens       -- show token audit stats
REM ============================================================

echo ============================================================
echo  Team Panchayat -- ADLC Sprint-01 Launcher v3.1
echo  Enterprise: model routing + context compile + parallel
echo ============================================================
echo.

if not exist "%~dp0start-agents.ps1" (
    echo ERROR: start-agents.ps1 not found.
    echo Make sure all files are in the ADLC-Agent-Kit folder.
    pause
    exit /b 1
)

REM -- compile only (no agents) -----------------------------------
if /i "%1"=="compile" (
    echo Pre-compiling agent contexts...
    node "%~dp0context-compiler.js"
    echo Done. Context files written to context\
    pause
    exit /b 0
)

REM -- token stats ------------------------------------------------
if /i "%1"=="tokens" (
    node "%~dp0context-compiler.js" --stats
    pause
    exit /b 0
)

REM -- autorun (compile + parallel launch) ------------------------
if /i "%1"=="autorun" (
    if "%2"=="" (
        powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1" -AutoRun
    ) else (
        powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1" -AutoRun -Agent "%2"
    )
    goto :done
)

REM -- interactive (default double-click) -------------------------
powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1"

:done
if errorlevel 1 (
    echo.
    echo PowerShell script exited with an error.
    pause
)
