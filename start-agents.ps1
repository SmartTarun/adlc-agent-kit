# ============================================================
# Author: Tarun Vangari (tarun.vangari@gmail.com)
# ADLC-Agent-Kit | Team Panchayat -- Sprint-01 Agent Launcher
#
# Usage:
#   .\start-agents.ps1              -- interactive (manual prompt paste)
#   .\start-agents.ps1 -AutoRun     -- auto-run all agents from prompt files
#   .\start-agents.ps1 -AutoRun -Agent vikram  -- auto-run one agent only
#
# Prerequisites: Run .\authorize-agents.ps1 ONCE before first use.
# ============================================================

param(
    [switch]$AutoRun,
    [string]$Agent = ""
)

$ROOT = $PSScriptRoot
Set-Location $ROOT

# ---- Pre-flight checks --------------------------------------------------------
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'claude' not found. Run: npm install -g @anthropic-ai/claude-code" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not $env:ANTHROPIC_API_KEY) {
    # Try loading from .env
    $envFile = Join-Path $ROOT ".env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match "^ANTHROPIC_API_KEY=" }
        if ($line) {
            $env:ANTHROPIC_API_KEY = ($line -replace "^ANTHROPIC_API_KEY=","").Trim().Trim('"',"'")
        }
    }
    if (-not $env:ANTHROPIC_API_KEY) {
        Write-Host "ERROR: ANTHROPIC_API_KEY not set. Run .\authorize-agents.ps1 first." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"

# ---- Banner ------------------------------------------------------------------
$mode = if ($AutoRun) { "AUTO-RUN (console auth)" } else { "INTERACTIVE (manual paste)" }
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Team Panchayat -- ADLC Sprint-01  [ $mode ]" -ForegroundColor Cyan
Write-Host "  Root: $ROOT" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Memory status -----------------------------------------------------------
Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  AGENT MEMORY STATUS" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------" -ForegroundColor Yellow
if (Test-Path (Join-Path $ROOT "memory-manager.js")) {
    Push-Location $ROOT
    node memory-manager.js
    Pop-Location
} else {
    Write-Host "  No memory manager found -- first run" -ForegroundColor Gray
}
Write-Host ""
Write-Host "Launching agent windows in 3 seconds..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

# ---- Helper: launch an AUTO-RUN agent window ---------------------------------
# Reads the prompt file and runs:
#   claude --print "<prompt>" --dangerously-skip-permissions
# Output is shown in the window and tee-d to agent-logs\<name>.log
function Start-AutoAgent {
    param([string]$Name, [string]$BgColor, [string]$FgColor, [string]$Label)
    $promptFile = Join-Path $ROOT "prompts\$Name-prompt.txt"
    $logFile    = Join-Path $ROOT "agent-logs\$Name.log"
    $escapedRoot = $ROOT -replace "'", "''"
    if (-not (Test-Path $promptFile)) {
        Write-Host "  SKIP $Name -- prompt file not found: $promptFile" -ForegroundColor Red
        return
    }
    $cmd = @"
`$Host.UI.RawUI.WindowTitle = '$Label'
`$Host.UI.RawUI.BackgroundColor = '$BgColor'
`$Host.UI.RawUI.ForegroundColor = '$FgColor'
Clear-Host
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  $Label' -ForegroundColor Yellow
Write-Host '  AUTO-RUN mode -- console authorized' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Set-Location '$escapedRoot'
`$env:ANTHROPIC_API_KEY = '$($env:ANTHROPIC_API_KEY)'
`$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
`$promptText = Get-Content 'prompts\$Name-prompt.txt' -Raw
Write-Host 'Prompt loaded. Starting claude...' -ForegroundColor DarkGray
claude --print `$promptText --dangerously-skip-permissions 2>&1 | Tee-Object -FilePath 'agent-logs\$Name.log' -Append
Write-Host ''
Write-Host '=== $Name agent finished ===' -ForegroundColor Green
Read-Host 'Press Enter to close'
"@
    Start-Process powershell -ArgumentList ('-NoExit', '-Command', $cmd)
}

# ---- Helper: launch an INTERACTIVE agent window ------------------------------
# Opens a claude session -- user pastes the prompt from prompts\ folder
function Start-AgentWindow {
    param([string]$Title, [string]$BgColor, [string]$FgColor, [string]$Label)
    $escapedRoot = $ROOT -replace "'", "''"
    $cmd = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
`$Host.UI.RawUI.BackgroundColor = '$BgColor'
`$Host.UI.RawUI.ForegroundColor = '$FgColor'
Clear-Host
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  $Label' -ForegroundColor Yellow
Write-Host '  Paste your prompt from the prompts\ folder' -ForegroundColor Gray
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Set-Location '$escapedRoot'
`$env:ANTHROPIC_API_KEY = '$($env:ANTHROPIC_API_KEY)'
`$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
claude --dangerously-skip-permissions
"@
    Start-Process powershell -ArgumentList ('-NoExit', '-Command', $cmd)
}

# ---- Agent definitions -------------------------------------------------------
$agentDefs = @(
    @{ Name="arjun";   BgColor="DarkMagenta"; FgColor="White"; Label="ARJUN  | PM / Orchestrator  | Claude Opus"    },
    @{ Name="vikram";  BgColor="DarkRed";     FgColor="White"; Label="VIKRAM | Cloud Architect    | Claude Sonnet"  },
    @{ Name="rasool";  BgColor="DarkYellow";  FgColor="Black"; Label="RASOOL | Database Agent     | Claude Sonnet"  },
    @{ Name="kavya";   BgColor="DarkMagenta"; FgColor="White"; Label="KAVYA  | UX Designer        | Claude Sonnet"  },
    @{ Name="kiran";   BgColor="DarkCyan";    FgColor="White"; Label="KIRAN  | Backend Engineer   | Claude Sonnet"  },
    @{ Name="rohan";   BgColor="DarkBlue";    FgColor="White"; Label="ROHAN  | Frontend Engineer  | Claude Sonnet"  }
)

# ---- 0. Group Chat Viewer ----------------------------------------------------
Write-Host "[0/8] Starting Group Chat Viewer..." -ForegroundColor Green
$chatCmd = @"
`$Host.UI.RawUI.WindowTitle = 'TEAM PANCHAYAT - Group Chat'
`$Host.UI.RawUI.BackgroundColor = 'Black'
Clear-Host
Write-Host '=== Team Panchayat Group Chat ===' -ForegroundColor Cyan
Set-Location '$ROOT'
node group-chat-viewer.js --watch
"@
Start-Process powershell -ArgumentList ('-NoExit', '-Command', $chatCmd)
Start-Sleep -Seconds 1

# ---- 1. Live Dashboard Server :3000 ------------------------------------------
Write-Host "[1/8] Starting Live Dashboard Server on :3000..." -ForegroundColor Green
$dashCmd = @"
`$Host.UI.RawUI.WindowTitle = 'ADLC - Live Dashboard Server :3000'
`$Host.UI.RawUI.BackgroundColor = 'DarkGreen'
Clear-Host
Write-Host '=== ADLC Live Dashboard Server ===' -ForegroundColor Green
Write-Host '  http://localhost:3000' -ForegroundColor Cyan
Set-Location '$ROOT'
node dashboard-server.js
"@
Start-Process powershell -ArgumentList ('-NoExit', '-Command', $dashCmd)

Write-Host "  Waiting for dashboard to come online..." -ForegroundColor Gray
$dashReady = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/api/state" -TimeoutSec 1 `
             -UseBasicParsing -ErrorAction SilentlyContinue 2>$null
        if ($r -and $r.StatusCode -eq 200) { $dashReady = $true; break }
    } catch {}
}
if ($dashReady) {
    Write-Host "  Dashboard is live -- opening browser..." -ForegroundColor Green
    Start-Process "http://localhost:3000"
} else {
    Write-Host "  Dashboard did not respond in 15s -- open http://localhost:3000 manually." -ForegroundColor Yellow
}

# ---- 2-7. Launch Agents (filtered if -Agent param given) ---------------------
$counter = 2
foreach ($def in $agentDefs) {
    # If -Agent filter is set, only launch that agent
    if ($Agent -ne "" -and $def.Name -ne $Agent.ToLower()) {
        $counter++
        continue
    }
    $label = $def.Label -replace '\|.*', ''   # extract first word for log message
    Write-Host "[$counter/8] Starting $($def.Name.ToUpper())..." -ForegroundColor Magenta
    if ($AutoRun) {
        Start-AutoAgent -Name $def.Name -BgColor $def.BgColor `
                        -FgColor $def.FgColor -Label $def.Label
    } else {
        Start-AgentWindow -Title  $def.Label -BgColor $def.BgColor `
                          -FgColor $def.FgColor -Label $def.Label
    }
    Start-Sleep -Seconds 1
    $counter++
}

Write-Host "[8/8] Keerthi (QA) starts manually after all agents are DONE." -ForegroundColor Gray
Write-Host ""

# ---- Final summary -----------------------------------------------------------
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  All windows launched!  [ $mode ]" -ForegroundColor Green
Write-Host ""
Write-Host "  LIVE DASHBOARD  ->  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
if ($AutoRun) {
    Write-Host "  AUTO-RUN: agents are reading their prompt files and" -ForegroundColor Yellow
    Write-Host "  executing with --dangerously-skip-permissions." -ForegroundColor Yellow
    Write-Host "  No manual paste needed -- watch the agent windows!" -ForegroundColor Green
} else {
    Write-Host "  PASTE PROMPTS IN THIS ORDER:" -ForegroundColor White
    Write-Host "  Phase 1 (all at once):" -ForegroundColor Gray
    Write-Host "    ARJUN   <- prompts\arjun-prompt.txt" -ForegroundColor DarkGray
    Write-Host "    VIKRAM  <- prompts\vikram-prompt.txt" -ForegroundColor DarkGray
    Write-Host "    RASOOL  <- prompts\rasool-prompt.txt" -ForegroundColor DarkGray
    Write-Host "    KAVYA   <- prompts\kavya-prompt.txt" -ForegroundColor DarkGray
    Write-Host "  Phase 2 (after Rasool + Kavya done):" -ForegroundColor Gray
    Write-Host "    KIRAN   <- prompts\kiran-prompt.txt" -ForegroundColor DarkGray
    Write-Host "    ROHAN   <- prompts\rohan-prompt.txt" -ForegroundColor DarkGray
    Write-Host "  Phase 3 (after ALL done):" -ForegroundColor Gray
    Write-Host "    KEERTHI <- prompts\keerthi-prompt.txt  (open manually)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  NEW PROJECT?  node new-project.js" -ForegroundColor Yellow
Write-Host "  TOOL SETUP?   node connect-tools.js" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close this launcher window"
