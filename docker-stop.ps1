# Agent: Arjun | Sprint: 01 | Date: 2026-03-16
# Team Panchayat -- Docker Cluster Shutdown
# Usage:
#   .\docker-stop.ps1                  -- stop all containers
#   .\docker-stop.ps1 -Volumes         -- stop and remove volumes
#   .\docker-stop.ps1 -Agent kiran     -- stop single agent
#   .\docker-stop.ps1 -Restart         -- restart all containers

param(
    [switch]$Volumes,
    [string]$Agent = "",
    [switch]$Restart
)

$KitDir = $PSScriptRoot
Set-Location $KitDir

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Yellow
Write-Host "  TEAM PANCHAYAT -- CLUSTER SHUTDOWN" -ForegroundColor Yellow
Write-Host "  ============================================" -ForegroundColor Yellow
Write-Host ""

if ($Restart) {
    Write-Host "  Restarting cluster..." -ForegroundColor Cyan
    docker compose restart
    Write-Host "  [OK] All containers restarted" -ForegroundColor Green
    exit 0
}

if ($Agent) {
    Write-Host "  Stopping $Agent..." -ForegroundColor Yellow
    docker compose stop $Agent
    Write-Host "  [OK] $Agent stopped" -ForegroundColor Green
    exit 0
}

Write-Host "  Stopping all containers..." -ForegroundColor Yellow
docker compose down

if ($Volumes) {
    Write-Host "  Removing volumes..." -ForegroundColor Yellow
    docker compose down -v
    Write-Host "  [OK] Volumes removed" -ForegroundColor Green
}

Write-Host "  [OK] Cluster stopped" -ForegroundColor Green
Write-Host "  Run .\docker-start.ps1 to restart" -ForegroundColor Gray
Write-Host ""
