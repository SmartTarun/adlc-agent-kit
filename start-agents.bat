@echo off
REM ============================================================
REM Author: Tarun Vangari (tarun.vangari@gmail.com)
REM ADLC-Agent-Kit | Team Panchayat -- Sprint-01 Agent Launcher
REM
REM Usage:
REM   start-agents.bat              -- interactive mode
REM   start-agents.bat autorun      -- auto-run all agents
REM   start-agents.bat autorun vikram  -- auto-run one agent
REM ============================================================

echo ============================================================
echo  Team Panchayat -- ADLC Sprint-01 Launcher
echo ============================================================
echo.

if not exist "%~dp0start-agents.ps1" (
    echo ERROR: start-agents.ps1 not found in %~dp0
    echo Make sure both files are in the ADLC-Agent-Kit folder.
    pause
    exit /b 1
)

if /i "%1"=="autorun" (
    if "%2"=="" (
        powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1" -AutoRun
    ) else (
        powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1" -AutoRun -Agent "%2"
    )
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0start-agents.ps1"
)

if errorlevel 1 (
    echo.
    echo PowerShell script exited with an error.
    pause
)
