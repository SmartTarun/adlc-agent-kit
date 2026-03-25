# Agent: Arjun | Sprint: 01 | Date: 2026-03-16
# Team Panchayat -- Docker Cluster Launcher
# Usage:
#   .\docker-start.ps1              -- start main cluster
#   .\docker-start.ps1 -Build       -- rebuild images first
#   .\docker-start.ps1 -qa          -- include Keerthi QA profile
#   .\docker-start.ps1 -Agent kiran -- start single agent only
#   .\docker-start.ps1 -Stop        -- stop the cluster

param(
    [switch]$Build,
    [switch]$qa,
    [string]$Agent = "",
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$KitDir = $PSScriptRoot

function Write-Header { param($msg) Write-Host "`n  ---- $msg" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err    { param($msg) Write-Host "  [ERR]  $msg" -ForegroundColor Red }
function Write-Info   { param($msg) Write-Host "  >>  $msg" -ForegroundColor Gray }

# Banner
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "  TEAM PANCHAYAT -- DOCKER CLUSTER" -ForegroundColor Cyan
Write-Host "  ADLC Agent Kit — Multi-Project AI Dev Team" -ForegroundColor Gray
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# Stop flag
if ($Stop) {
    Write-Header "Stopping all containers..."
    Set-Location $KitDir
    docker compose down
    Write-Ok "Cluster stopped."
    exit 0
}

# ---- Pre-flight checks -------------------------------------------------------
Write-Header "Pre-flight checks"

# Check Docker is running
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker not running" }
    Write-Ok "Docker Desktop is running"
} catch {
    Write-Err "Docker is not running. Start Docker Desktop first."
    Read-Host "Press Enter to exit"
    exit 1
}

# Check .env file
if (-not (Test-Path "$KitDir\.env")) {
    if (Test-Path "$KitDir\.env.template") {
        Write-Warn ".env not found -- copying from .env.template..."
        Copy-Item "$KitDir\.env.template" "$KitDir\.env"
        Write-Warn "Edit .env and add your ANTHROPIC_API_KEY, then re-run."
        Read-Host "Press Enter to exit"
        exit 1
    } else {
        Write-Err ".env missing. Run .\authorize-agents.ps1 first."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check API key in .env
$envContent = Get-Content "$KitDir\.env" -Raw
if ($envContent -notmatch "ANTHROPIC_API_KEY=sk-ant-") {
    Write-Err "ANTHROPIC_API_KEY not set in .env. Run .\authorize-agents.ps1 first."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Ok ".env found with API key"

# Check required files
$required = @(
    "Dockerfile.base", "Dockerfile.dashboard",
    "docker-compose.yml", "docker-dashboard-server.js",
    "sprint-board.html", "docker-entrypoint.sh"
)
foreach ($f in $required) {
    if (-not (Test-Path "$KitDir\$f")) {
        Write-Err "Required file missing: $f"
        exit 1
    }
}
Write-Ok "All required files present"

# Ensure workspace directories exist
$dirs = @("agent-memory","agent-logs","prompts","infra","backend","frontend","docs")
foreach ($d in $dirs) {
    if (-not (Test-Path "$KitDir\$d")) {
        New-Item -ItemType Directory -Path "$KitDir\$d" -Force | Out-Null
    }
}

# Ensure agent-status.json exists with all 7 agents
if (-not (Test-Path "$KitDir\agent-status.json")) {
    $agents = @{}
    foreach ($a in @("arjun","vikram","rasool","kavya","kiran","rohan","keerthi")) {
        $agents[$a] = @{
            status   = "queue"
            progress = 0
            task     = "Waiting for instructions"
            blocker  = ""
            updated  = (Get-Date -Format "o")
        }
    }
    @{ sprint = "01"; agents = $agents } | ConvertTo-Json -Depth 5 | Set-Content "$KitDir\agent-status.json" -Encoding UTF8
}

# Ensure group-chat.json exists
if (-not (Test-Path "$KitDir\group-chat.json")) {
    '{"channel":"team-panchayat-general","messages":[]}' | Set-Content "$KitDir\group-chat.json" -Encoding UTF8
}

Write-Ok "Workspace ready"

# ---- Build images (optional) -------------------------------------------------
Set-Location $KitDir

if ($Build) {
    Write-Header "Building Docker images (this may take a few minutes)..."
    docker compose build --no-cache
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Image build failed. Check the error above."
        exit 1
    }
    Write-Ok "Images built successfully"
}

# ---- Start cluster -----------------------------------------------------------
Write-Header "Starting Team Panchayat cluster..."

if ($Agent) {
    Write-Info "Starting single agent: $Agent"
    docker compose up -d $Agent
} elseif ($qa) {
    Write-Info "Starting full cluster including Keerthi QA..."
    docker compose --profile qa up -d
} else {
    Write-Info "Starting 7 core services (Keerthi starts on demand via dashboard)..."
    docker compose up -d
}

if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to start cluster. Run: docker compose logs"
    exit 1
}

# ---- Wait for dashboard health check -----------------------------------------
Write-Header "Waiting for dashboard (up to 30s)..."
$maxWait   = 30
$waited    = 0
$dashReady = $false
do {
    Start-Sleep -Seconds 2
    $waited += 2
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/state" -TimeoutSec 2 `
                -UseBasicParsing -ErrorAction SilentlyContinue 2>$null
        if ($resp -and $resp.StatusCode -eq 200) { $dashReady = $true; break }
    } catch {}
    Write-Host "      Waiting... ($waited/$maxWait s)" -ForegroundColor DarkGray
} while ($waited -lt $maxWait)

if ($dashReady) {
    Write-Ok "Dashboard is live!"
} else {
    Write-Warn "Dashboard health check timed out -- it may still be starting"
}

# ---- Container status --------------------------------------------------------
Write-Header "Container status"
docker compose ps

# ---- Summary -----------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "  CLUSTER READY!" -ForegroundColor Green
Write-Host ""
Write-Host "  Sprint Board  ->  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  SSE Events    ->  http://localhost:3000/events" -ForegroundColor DarkGray
Write-Host "  API State     ->  http://localhost:3000/api/state" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor White
Write-Host "    docker compose logs -f arjun       -- Follow Arjun logs" -ForegroundColor DarkGray
Write-Host "    docker compose logs -f             -- Follow all logs" -ForegroundColor DarkGray
Write-Host "    docker compose ps                  -- Container status" -ForegroundColor DarkGray
Write-Host "    .\docker-stop.ps1                  -- Stop the cluster" -ForegroundColor DarkGray
Write-Host "    docker compose up --scale kiran=2  -- Scale Kiran" -ForegroundColor DarkGray
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""

# Open browser
try {
    Start-Process "http://localhost:3000"
    Write-Ok "Browser opened at http://localhost:3000"
} catch {
    Write-Info "Open http://localhost:3000 in your browser"
}
