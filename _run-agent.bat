@echo off
REM Agent: Launcher | Sprint: 01 | Date: 2026-03-21
REM ---------------------------------------------------------------
REM _run-agent.bat  -- Per-agent window bootstrap
REM Author: Tarun Vangari (tarun.vangari@gmail.com)
REM
REM Called internally by start-agents.bat. NOT for direct use.
REM
REM  %%1  agent name   (arjun | vikram | rasool | kavya | kiran |
REM                     rohan | keerthi | dashboard | chat)
REM  %%2  model        (claude-opus-4-6 | claude-sonnet-4-6 |
REM                     claude-haiku-4-5-20251001 | - )
REM  %%3  mode         (interactive | autorun | server | chatviewer)
REM  %%4  project root (absolute path)
REM  %%5  kit root     (absolute path)
REM  %%6  color code   (CMD color code e.g. 5F, 4F, 60, 07)
REM ---------------------------------------------------------------
setlocal enabledelayedexpansion

set "AGENTNAME=%~1"
set "MODEL=%~2"
set "MODE=%~3"
set "PROJROOT=%~4"
set "KITROOT=%~5"
set "COLORCODE=%~6"

color %COLORCODE%
title %AGENTNAME%
cd /d "%PROJROOT%"

REM ---- Dashboard server mode --------------------------------------------------
if /i "%MODE%"=="server" (
    echo ============================================================
    echo   ADLC Live Dashboard Server
    echo   http://localhost:3000
    echo ============================================================
    echo.
    node "%KITROOT%\dashboard-server.js"
    goto :eof
)

REM ---- Chat viewer mode -------------------------------------------------------
if /i "%MODE%"=="chatviewer" (
    echo ============================================================
    echo   Team Panchayat -- Group Chat Viewer
    echo ============================================================
    echo.
    node "%KITROOT%\group-chat-viewer.js" --watch
    goto :eof
)

REM ---- Agent header (interactive and autorun) ---------------------------------
echo ============================================================
echo   %AGENTNAME%
if not "%MODEL%"=="-" echo   Model  : %MODEL%
echo   Project: %PROJROOT%
echo ============================================================
echo.

REM ---- Interactive mode -------------------------------------------------------
if /i "%MODE%"=="interactive" (
    echo Paste your prompt and press Enter.
    echo.
    claude --dangerously-skip-permissions
    goto :eof
)

REM ---- Autorun mode -----------------------------------------------------------
if /i "%MODE%"=="autorun" (
    set "PROMPTFILE=%KITROOT%\prompts\%AGENTNAME%-prompt.txt"
    if not exist "!PROMPTFILE!" (
        echo ERROR: Prompt file not found: !PROMPTFILE!
        echo Falling back to interactive mode -- paste prompt manually.
        echo.
        claude --dangerously-skip-permissions
        goto :eof
    )
    echo Running autorun from: prompts\%AGENTNAME%-prompt.txt
    echo.
    type "!PROMPTFILE!" | claude --dangerously-skip-permissions --model %MODEL%
    goto :eof
)

echo ERROR: Unknown mode '%MODE%'. Valid modes: interactive, autorun, server, chatviewer
pause
