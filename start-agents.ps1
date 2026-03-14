# ============================================================
# Author: Tarun Vangari (tarun.vangari@gmail.com) | ADLC-Agent-Kit | 2026-03-14
#  Team Panchayat — ADLC Sprint-01 Agent Launcher
#  Run this in PowerShell:  .\start-agents.ps1
# ============================================================

$ROOT = "$env:USERPROFILE\TeamPanchayat"

# ── Check project exists ────────────────────────────────────
if (-not (Test-Path $ROOT)) {
    Write-Host "ERROR: Project folder not found at $ROOT" -ForegroundColor Red
    Write-Host "Please run setup-workspace.bat first!" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Check claude is installed ───────────────────────────────
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'claude' command not found." -ForegroundColor Red
    Write-Host "Install it by running:  npm install -g @anthropic-ai/claude-code" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Team Panchayat - ADLC Sprint-01" -ForegroundColor Cyan
Write-Host "  Launching 7 PowerShell windows..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Helper function to open a named PowerShell window
function Start-AgentWindow {
    param(
        [string]$Title,
        [string]$BgColor,
        [string]$FgColor,
        [string]$Label
    )
    $cmd = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
`$Host.UI.RawUI.BackgroundColor = '$BgColor'
`$Host.UI.RawUI.ForegroundColor = '$FgColor'
Clear-Host
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  $Label' -ForegroundColor Yellow
Write-Host '  Working dir: $ROOT' -ForegroundColor Gray
Write-Host '  Paste your prompt from the prompts\ folder' -ForegroundColor Gray
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Set-Location '$ROOT'
claude
"@
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd
}

# ── 0. Dashboard Sync Watcher ───────────────────────────────
Write-Host "[0/6] Starting Dashboard Sync watcher..." -ForegroundColor Green
$syncCmd = @"
`$Host.UI.RawUI.WindowTitle = 'ADLC - Dashboard Sync'
`$Host.UI.RawUI.BackgroundColor = 'DarkGreen'
Clear-Host
Write-Host '=== ADLC Dashboard Sync Watcher ===' -ForegroundColor Green
Write-Host 'Watching agent-status.json for changes...' -ForegroundColor White
Write-Host ''
Set-Location '$ROOT'
node sync-dashboard.js --watch
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $syncCmd
Start-Sleep -Seconds 2

# ── 1. Arjun — Orchestrator (Opus) ─────────────────────────
Write-Host "[1/6] Starting Arjun (Orchestrator - Opus)..." -ForegroundColor Magenta
Start-AgentWindow -Title "ARJUN - Orchestrator (Opus)" `
                  -BgColor "DarkMagenta" -FgColor "White" `
                  -Label "ARJUN | PM / Orchestrator | Claude Opus"
Start-Sleep -Seconds 2

# ── 2. Vikram — Cloud Architect ────────────────────────────
Write-Host "[2/6] Starting Vikram (Cloud Architect)..." -ForegroundColor Red
Start-AgentWindow -Title "VIKRAM - Cloud Architect" `
                  -BgColor "DarkRed" -FgColor "White" `
                  -Label "VIKRAM | Cloud Architect | Claude Sonnet"
Start-Sleep -Seconds 1

# ── 3. Rasool — Database Agent ─────────────────────────────
Write-Host "[3/6] Starting Rasool (Database Agent)..." -ForegroundColor Yellow
Start-AgentWindow -Title "RASOOL - Database Agent" `
                  -BgColor "DarkYellow" -FgColor "Black" `
                  -Label "RASOOL | Database Agent | Claude Sonnet"
Start-Sleep -Seconds 1

# ── 4. Kiran — Backend Engineer ────────────────────────────
Write-Host "[4/6] Starting Kiran (Backend Engineer)..." -ForegroundColor Cyan
Start-AgentWindow -Title "KIRAN - Backend Engineer" `
                  -BgColor "DarkCyan" -FgColor "White" `
                  -Label "KIRAN | Backend Engineer | Claude Sonnet"
Start-Sleep -Seconds 1

# ── 5. Kavya — UX Designer ─────────────────────────────────
Write-Host "[5/6] Starting Kavya (UX Designer)..." -ForegroundColor Magenta
Start-AgentWindow -Title "KAVYA - UX Designer" `
                  -BgColor "DarkMagenta" -FgColor "White" `
                  -Label "KAVYA | UX Designer | Claude Sonnet"
Start-Sleep -Seconds 1

# ── 6. Rohan — Frontend Engineer ───────────────────────────
Write-Host "[6/6] Starting Rohan (Frontend Engineer)..." -ForegroundColor Blue
Start-AgentWindow -Title "ROHAN - Frontend Engineer" `
                  -BgColor "DarkBlue" -FgColor "White" `
                  -Label "ROHAN | Frontend Engineer | Claude Sonnet"
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  All 7 windows launched!" -ForegroundColor Green
Write-Host ""
Write-Host "  NEXT STEPS:" -ForegroundColor White
Write-Host "  1. Open sprint-dashboard.html in your browser" -ForegroundColor Gray
Write-Host "     $ROOT\sprint-dashboard.html" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  2. Paste prompts in this ORDER:" -ForegroundColor White
Write-Host "     Phase 1 (all at once):" -ForegroundColor Gray
Write-Host "       ARJUN   <- prompts\arjun-prompt.txt" -ForegroundColor DarkGray
Write-Host "       VIKRAM  <- prompts\vikram-prompt.txt" -ForegroundColor DarkGray
Write-Host "       RASOOL  <- prompts\rasool-prompt.txt" -ForegroundColor DarkGray
Write-Host "       KAVYA   <- prompts\kavya-prompt.txt" -ForegroundColor DarkGray
Write-Host "     Phase 2 (after Rasool/Kavya done):" -ForegroundColor Gray
Write-Host "       KIRAN   <- prompts\kiran-prompt.txt" -ForegroundColor DarkGray
Write-Host "       ROHAN   <- prompts\rohan-prompt.txt" -ForegroundColor DarkGray
Write-Host "     Phase 3 (after ALL done):" -ForegroundColor Gray
Write-Host "       KEERTHI <- prompts\keerthi-prompt.txt" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  3. Watch your dashboard update live!" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close this window"
