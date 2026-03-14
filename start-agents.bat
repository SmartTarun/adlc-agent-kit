@echo off
REM Author: Tarun Vangari (tarun.vangari@gmail.com) | ADLC-Agent-Kit | 2026-03-14
echo ============================================================
echo  Team Panchayat - ADLC Sprint-01 Agent Launcher
echo  (Launching via PowerShell)
echo ============================================================
echo.

set ROOT=%USERPROFILE%\TeamPanchayat

REM Check if project folder exists
if not exist "%ROOT%" (
    echo ERROR: Project folder not found at %ROOT%
    echo Please run setup-workspace.bat first!
    pause
    exit /b 1
)

REM Check if claude is available in PowerShell
powershell -Command "claude --version" >nul 2>&1
if errorlevel 1 (
    echo ERROR: 'claude' command not found.
    echo Install it by running in PowerShell:
    echo   npm install -g @anthropic-ai/claude-code
    pause
    exit /b 1
)

echo Project found at: %ROOT%
echo Launching 7 PowerShell windows...
echo.

REM ── Dashboard Sync Watcher ──────────────────────────────────
echo [0/6] Dashboard Sync watcher...
powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd \"%ROOT%\"; $Host.UI.RawUI.WindowTitle = \"ADLC-Dashboard-Sync\"; $Host.UI.RawUI.BackgroundColor = \"DarkGreen\"; Clear-Host; Write-Host \"=== ADLC Dashboard Sync ===\"; node sync-dashboard.js --watch'"
timeout /t 2 /nobreak >nul

REM ── Arjun — Orchestrator ────────────────────────────────────
echo [1/6] Starting Arjun (Orchestrator - Opus)...
powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd \"%ROOT%\"; $Host.UI.RawUI.WindowTitle = \"ARJUN - Orchestrator\"; $Host.UI.RawUI.BackgroundColor = \"DarkMagenta\"; Clear-Host; Write-Host \"=== ARJUN | PM / Orchestrator | Claude Opus ===\"; claude'"
timeout /t 3 /nobreak >nul

REM ── Vikram — Cloud Architect ────────────────────────────────
echo [2/6] Starting Vikram (Cloud Architect)...
powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd \"%ROOT%\"; $Host.UI.RawUI.WindowTitle = \"VIKRAM - Cloud Architect\"; $Host.UI.RawUI.BackgroundColor = \"DarkRed\"; Clear-Host; Write-Host \"=== VIKRAM | Cloud Architect | Claude Sonnet ===\"; claude'"
timeout /t 2 /nobreak >nul

REM ── Rasool — Database Agent ─────────────────────────────────
echo [3/6] Starting Rasool (Database Agent)...
powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd \"%ROOT%\"; $Host.UI.RawUI.WindowTitle = \"RASOOL - Database Agent\"; $Host.UI.RawUI.BackgroundColor = \"DarkYellow\"; Clear-Host; Write-Host \"=== RASOOL | Database Agent | Claude Sonnet ===\"; claude'"
timeout /t 2 /nobreak >nul

REM ── Kiran — Backend Engineer ────────────────────────────────
echo [4/6] Starting Kiran (Backend Engineer)...
powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd \"%ROOT%\"; $Host.UI.RawUI.WindowTitle = \"KIRAN - Backend Engineer\"; $Host.UI.RawUI.BackgroundColor = \"DarkCyan\"; Clear-Host; Write-Host \"=== KIRAN | Backend Engineer | Claude Sonnet ===\"; claude'"
timeout /t 2 /nobreak >nul

REM ── Kavya — UX Designer ─────────────────────────────────────
echo [5/6] Starting Kavya (UX Designer)...
powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd \"%ROOT%\"; $Host.UI.RawUI.WindowTitle = \"KAVYA - UX Designer\"; $Host.UI.RawUI.BackgroundColor = \"DarkMagenta\"; Clear-Host; Write-Host \"=== KAVYA | UX Designer | Claude Sonnet ===\"; claude'"
timeout /t 2 /nobreak >nul

REM ── Rohan — Frontend Engineer ───────────────────────────────
echo [6/6] Starting Rohan (Frontend Engineer)...
powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd \"%ROOT%\"; $Host.UI.RawUI.WindowTitle = \"ROHAN - Frontend Engineer\"; $Host.UI.RawUI.BackgroundColor = \"DarkBlue\"; Clear-Host; Write-Host \"=== ROHAN | Frontend Engineer | Claude Sonnet ===\"; claude'"
timeout /t 2 /nobreak >nul

echo.
echo ============================================================
echo  All 7 PowerShell windows launched!
echo.
echo  NEXT STEPS:
echo  1. Open sprint-dashboard.html in your browser
echo  2. Go to ARJUN window, paste prompts\arjun-prompt.txt
echo  3. Go to each agent window, paste their prompt file
echo  4. Watch the dashboard update live!
echo.
echo  TIP: Each window has a different background colour
echo       Use Alt+Tab or taskbar to switch between them
echo ============================================================
pause
