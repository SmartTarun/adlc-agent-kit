# Agent: Launcher | Sprint: 01 | Date: 2026-03-16
# Team Panchayat -- ADLC Agent Launcher v3.2 (multi-project)
# Usage: .\start-agents.ps1                        -- interactive (paste prompts manually)
#        .\start-agents.ps1 -AutoRun               -- autorun (compile + parallel launch)
#        .\start-agents.ps1 -SkipCompile           -- skip context pre-compile step
#        .\start-agents.ps1 -Project "projects\req-NNN-name"  -- use specific project folder

param(
    [switch]$AutoRun,
    [switch]$SkipCompile,
    [string]$Agent   = "",
    [string]$Project = ""
)

# --- Resolve kit root (always the ADLC-Agent-Kit folder) ---------------------
$KITROOT = $PSScriptRoot
if (-not $KITROOT) { $KITROOT = Split-Path -Parent $MyInvocation.MyCommand.Path }

# Alias ROOT to KITROOT for static resources (prompts, dashboard-server, etc.)
$ROOT = $KITROOT

# --- Resolve PROJECTROOT from -Project flag or active-project.json -----------
function Get-ProjectRoot {
    param([string]$Kit, [string]$ProjectArg)
    if ($ProjectArg -ne "") {
        $abs = Join-Path $Kit $ProjectArg
        if (Test-Path $abs) { return $abs }
        Write-Host "  WARNING: -Project path not found: $abs -- falling back to active-project.json" -ForegroundColor Yellow
    }
    $apFile = Join-Path $Kit "active-project.json"
    if (Test-Path $apFile) {
        try {
            $ap = Get-Content $apFile -Raw | ConvertFrom-Json
            $rel = $ap.current
            if ($rel -eq "." -or $rel -eq "" -or $null -eq $rel) { return $Kit }
            return Join-Path $Kit $rel
        } catch {
            Write-Host "  WARNING: Could not parse active-project.json -- using kit root" -ForegroundColor Yellow
        }
    }
    return $Kit
}

$PROJECTROOT = Get-ProjectRoot -Kit $KITROOT -ProjectArg $Project

# --- Model routing -----------------------------------------------------------
$ModelMap = @{
    arjun   = "claude-opus-4-6"
    vikram  = "claude-sonnet-4-6"
    rasool  = "claude-sonnet-4-6"
    kiran   = "claude-sonnet-4-6"
    rohan   = "claude-sonnet-4-6"
    kavya   = "claude-haiku-4-5-20251001"
    keerthi = "claude-haiku-4-5-20251001"
}

# --- Sanity checks -----------------------------------------------------------
if (-not (Test-Path $ROOT)) {
    Write-Host "ERROR: Project folder not found at $ROOT" -ForegroundColor Red
    Write-Host "Please run setup-workspace.bat first!" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'claude' command not found." -ForegroundColor Red
    Write-Host "Install it: npm install -g @anthropic-ai/claude-code" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# --- Print header ------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Team Panchayat -- ADLC Launcher v3.2 (multi-project)" -ForegroundColor Cyan
Write-Host "  Kit root:     $KITROOT" -ForegroundColor DarkCyan
Write-Host "  Project root: $PROJECTROOT" -ForegroundColor DarkCyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --- Pre-compile contexts ----------------------------------------------------
if (-not $SkipCompile) {
    $ccPath = Join-Path $ROOT "context-compiler.js"
    if (Test-Path $ccPath) {
        Write-Host "  [COMPILE] Pre-compiling agent contexts..." -ForegroundColor Cyan
        Push-Location $ROOT
        node context-compiler.js --stats 2>&1 | Out-Host
        Pop-Location
        Write-Host "  [COMPILE] Done." -ForegroundColor Green
        Write-Host ""
    }
}

# --- Helper: launch INTERACTIVE agent window ---------------------------------
function Start-InteractiveAgent {
    param(
        [string]$Title,
        [string]$BgColor,
        [string]$FgColor,
        [string]$Label,
        [string]$ProjRoot,
        [string]$KitRoot
    )
    $pr = $ProjRoot -replace "'", "''"
    $kr = $KitRoot  -replace "'", "''"
    $t  = $Title    -replace "'", "''"
    $l  = $Label    -replace "'", "''"
    $cmd = "`$Host.UI.RawUI.WindowTitle = '$t'; " +
           "`$Host.UI.RawUI.BackgroundColor = '$BgColor'; " +
           "`$Host.UI.RawUI.ForegroundColor = '$FgColor'; " +
           "Clear-Host; " +
           "Write-Host '--- $l ---' -ForegroundColor Yellow; " +
           "Write-Host 'Project: $pr' -ForegroundColor DarkGray; " +
           "Write-Host 'Paste your prompt and press Enter.' -ForegroundColor Gray; " +
           "Write-Host ''; " +
           "Set-Location '$pr'; " +
           "claude"
    Start-Process powershell -ArgumentList ('-NoExit', '-Command', $cmd)
}

# --- Helper: launch AUTORUN agent window -------------------------------------
function Start-AutoAgent {
    param(
        [string]$Name,
        [string]$Title,
        [string]$BgColor,
        [string]$FgColor,
        [string]$Label,
        [string]$Model,
        [string]$ProjRoot,
        [string]$KitRoot
    )
    $pr = $ProjRoot  -replace "'", "''"
    $kr = $KitRoot   -replace "'", "''"
    $t  = $Title     -replace "'", "''"
    $l  = $Label     -replace "'", "''"
    # Prompt files always come from KITROOT\prompts\
    $pp = (Join-Path $KitRoot "prompts\$Name-prompt.txt") -replace "'", "''"
    $cmd = "`$Host.UI.RawUI.WindowTitle = '$t'; " +
           "`$Host.UI.RawUI.BackgroundColor = '$BgColor'; " +
           "`$Host.UI.RawUI.ForegroundColor = '$FgColor'; " +
           "Clear-Host; " +
           "Write-Host '--- $l ---' -ForegroundColor Yellow; " +
           "Write-Host 'Model: $Model' -ForegroundColor Cyan; " +
           "Write-Host 'Project: $pr' -ForegroundColor DarkGray; " +
           "Write-Host ''; " +
           "Set-Location '$pr'; " +
           "`$p = Get-Content '$pp' -Raw -ErrorAction SilentlyContinue; " +
           "if (`$p) { claude --dangerously-skip-permissions --model '$Model' -p `$p } " +
           "else { Write-Host 'ERROR: prompt file not found at $pp' -ForegroundColor Red; " +
           "claude --dangerously-skip-permissions --model '$Model' }"
    Start-Process powershell -ArgumentList ('-NoExit', '-Command', $cmd)
}

# --- Start Dashboard Server --------------------------------------------------
Write-Host "  [DASH] Starting Dashboard Server on :3000..." -ForegroundColor Green
$kr = $KITROOT -replace "'", "''"
$dashCmd = "`$Host.UI.RawUI.WindowTitle = 'ADLC - Dashboard :3000'; " +
           "`$Host.UI.RawUI.BackgroundColor = 'DarkGreen'; " +
           "Clear-Host; " +
           "Write-Host 'ADLC Live Dashboard Server' -ForegroundColor Green; " +
           "Write-Host 'http://localhost:3000' -ForegroundColor Cyan; " +
           "Write-Host ''; " +
           "Set-Location '$kr'; " +
           "node dashboard-server.js"
Start-Process powershell -ArgumentList ('-NoExit', '-Command', $dashCmd)
Start-Sleep -Seconds 2

# --- Start Group Chat Viewer -------------------------------------------------
Write-Host "  [CHAT] Starting Group Chat Viewer..." -ForegroundColor Cyan
$pr = $PROJECTROOT -replace "'", "''"
$chatCmd = "`$Host.UI.RawUI.WindowTitle = 'ADLC - Group Chat'; " +
           "`$Host.UI.RawUI.BackgroundColor = 'Black'; " +
           "Clear-Host; " +
           "Write-Host 'Team Panchayat -- Group Chat' -ForegroundColor Cyan; " +
           "Write-Host ''; " +
           "Set-Location '$pr'; " +
           "node '$kr\group-chat-viewer.js' --watch"
Start-Process powershell -ArgumentList ('-NoExit', '-Command', $chatCmd)
Start-Sleep -Seconds 1

Write-Host ""

# --- AUTORUN MODE ------------------------------------------------------------
if ($AutoRun) {

    Write-Host "  AUTORUN MODE -- launching agents in parallel..." -ForegroundColor Yellow
    Write-Host ""

    if ($Agent -ne "") {
        # Single agent mode
        $mdl = $ModelMap[$Agent.ToLower()]
        if (-not $mdl) { $mdl = "claude-sonnet-4-6" }
        $nm  = $Agent.ToLower()
        $lbl = $Agent.ToUpper()
        Write-Host "  Launching single agent: $lbl ($mdl)" -ForegroundColor Cyan
        Start-AutoAgent -Name $nm `
            -Title "$lbl - Agent" `
            -BgColor "DarkBlue" -FgColor "White" `
            -Label "$lbl | Claude Agent | $mdl" `
            -Model $mdl `
            -ProjRoot $PROJECTROOT -KitRoot $KITROOT
    } else {
        # Phase 1: Arjun + Vikram + Rasool + Kavya (true parallel)
        Write-Host "  Phase 1 (parallel): Arjun, Vikram, Rasool, Kavya" -ForegroundColor Cyan

        Write-Host "  [1/6] Arjun (Opus)..." -ForegroundColor Magenta
        Start-AutoAgent -Name "arjun" `
            -Title "ARJUN - Orchestrator (Opus)" `
            -BgColor "DarkMagenta" -FgColor "White" `
            -Label "ARJUN | PM / Orchestrator | Opus" `
            -Model $ModelMap["arjun"] `
            -ProjRoot $PROJECTROOT -KitRoot $KITROOT

        Write-Host "  [2/6] Vikram (Sonnet)..." -ForegroundColor Red
        Start-AutoAgent -Name "vikram" `
            -Title "VIKRAM - Cloud Architect" `
            -BgColor "DarkRed" -FgColor "White" `
            -Label "VIKRAM | Cloud Architect | Sonnet" `
            -Model $ModelMap["vikram"] `
            -ProjRoot $PROJECTROOT -KitRoot $KITROOT

        Write-Host "  [3/6] Rasool (Sonnet)..." -ForegroundColor Yellow
        Start-AutoAgent -Name "rasool" `
            -Title "RASOOL - Database Agent" `
            -BgColor "DarkYellow" -FgColor "Black" `
            -Label "RASOOL | Database Agent | Sonnet" `
            -Model $ModelMap["rasool"] `
            -ProjRoot $PROJECTROOT -KitRoot $KITROOT

        Write-Host "  [4/6] Kavya (Haiku)..." -ForegroundColor Magenta
        Start-AutoAgent -Name "kavya" `
            -Title "KAVYA - UX Designer" `
            -BgColor "DarkMagenta" -FgColor "White" `
            -Label "KAVYA | UX Designer | Haiku" `
            -Model $ModelMap["kavya"] `
            -ProjRoot $PROJECTROOT -KitRoot $KITROOT

        Write-Host ""
        Write-Host "  Phase 1 launched. Phase 2 starts in 15 seconds..." -ForegroundColor Cyan
        Start-Sleep -Seconds 15

        # Phase 2: Kiran + Rohan (need Rasool schema + Kavya tokens first)
        Write-Host "  Phase 2: Kiran, Rohan" -ForegroundColor Cyan

        Write-Host "  [5/6] Kiran (Sonnet)..." -ForegroundColor Cyan
        Start-AutoAgent -Name "kiran" `
            -Title "KIRAN - Backend Engineer" `
            -BgColor "DarkCyan" -FgColor "White" `
            -Label "KIRAN | Backend Engineer | Sonnet" `
            -Model $ModelMap["kiran"] `
            -ProjRoot $PROJECTROOT -KitRoot $KITROOT

        Write-Host "  [6/6] Rohan (Sonnet)..." -ForegroundColor Blue
        Start-AutoAgent -Name "rohan" `
            -Title "ROHAN - Frontend Engineer" `
            -BgColor "DarkBlue" -FgColor "White" `
            -Label "ROHAN | Frontend Engineer | Sonnet" `
            -Model $ModelMap["rohan"] `
            -ProjRoot $PROJECTROOT -KitRoot $KITROOT
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  All agents launched in AUTORUN mode!" -ForegroundColor Green
    Write-Host "  Dashboard: http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  Keerthi activates after all 5 build agents are DONE." -ForegroundColor Gray
    Write-Host "============================================================" -ForegroundColor Green

# --- INTERACTIVE MODE --------------------------------------------------------
} else {

    Write-Host "  INTERACTIVE MODE -- paste prompts manually in each window." -ForegroundColor Yellow
    Write-Host ""

    Write-Host "  [1/6] Arjun..." -ForegroundColor Magenta
    Start-InteractiveAgent -Title "ARJUN - Orchestrator (Opus)" `
        -BgColor "DarkMagenta" -FgColor "White" `
        -Label "ARJUN | PM / Orchestrator | Claude Opus" `
        -ProjRoot $PROJECTROOT -KitRoot $KITROOT
    Start-Sleep -Seconds 1

    Write-Host "  [2/6] Vikram..." -ForegroundColor Red
    Start-InteractiveAgent -Title "VIKRAM - Cloud Architect" `
        -BgColor "DarkRed" -FgColor "White" `
        -Label "VIKRAM | Cloud Architect | Claude Sonnet" `
        -ProjRoot $PROJECTROOT -KitRoot $KITROOT
    Start-Sleep -Seconds 1

    Write-Host "  [3/6] Rasool..." -ForegroundColor Yellow
    Start-InteractiveAgent -Title "RASOOL - Database Agent" `
        -BgColor "DarkYellow" -FgColor "Black" `
        -Label "RASOOL | Database Agent | Claude Sonnet" `
        -ProjRoot $PROJECTROOT -KitRoot $KITROOT
    Start-Sleep -Seconds 1

    Write-Host "  [4/6] Kavya..." -ForegroundColor Magenta
    Start-InteractiveAgent -Title "KAVYA - UX Designer" `
        -BgColor "DarkMagenta" -FgColor "White" `
        -Label "KAVYA | UX Designer | Claude Haiku" `
        -ProjRoot $PROJECTROOT -KitRoot $KITROOT
    Start-Sleep -Seconds 1

    Write-Host "  [5/6] Kiran..." -ForegroundColor Cyan
    Start-InteractiveAgent -Title "KIRAN - Backend Engineer" `
        -BgColor "DarkCyan" -FgColor "White" `
        -Label "KIRAN | Backend Engineer | Claude Sonnet" `
        -ProjRoot $PROJECTROOT -KitRoot $KITROOT
    Start-Sleep -Seconds 1

    Write-Host "  [6/6] Rohan..." -ForegroundColor Blue
    Start-InteractiveAgent -Title "ROHAN - Frontend Engineer" `
        -BgColor "DarkBlue" -FgColor "White" `
        -Label "ROHAN | Frontend Engineer | Claude Sonnet" `
        -ProjRoot $PROJECTROOT -KitRoot $KITROOT

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  All 6 windows launched (interactive mode)!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  PASTE PROMPTS IN THIS ORDER:" -ForegroundColor White
    Write-Host "    Phase 1 (all at once):" -ForegroundColor Gray
    Write-Host "      ARJUN   <- prompts\arjun-prompt.txt" -ForegroundColor DarkGray
    Write-Host "      VIKRAM  <- prompts\vikram-prompt.txt" -ForegroundColor DarkGray
    Write-Host "      RASOOL  <- prompts\rasool-prompt.txt" -ForegroundColor DarkGray
    Write-Host "      KAVYA   <- prompts\kavya-prompt.txt" -ForegroundColor DarkGray
    Write-Host "    Phase 2 (after Rasool + Kavya done):" -ForegroundColor Gray
    Write-Host "      KIRAN   <- prompts\kiran-prompt.txt" -ForegroundColor DarkGray
    Write-Host "      ROHAN   <- prompts\rohan-prompt.txt" -ForegroundColor DarkGray
    Write-Host "    Phase 3 (after ALL 5 build agents done):" -ForegroundColor Gray
    Write-Host "      KEERTHI <- prompts\keerthi-prompt.txt" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Dashboard: http://localhost:3000" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Green
}

Write-Host ""
Read-Host "Press Enter to close this launcher"
