# Agent: arjun | Sprint: dynamic | Date: 2026-03-28
# ADLC-Agent-Kit -- One-click startup
# Author: Tarun Vangari (tarun.vangari@gmail.com)
# Usage: .\start.ps1

$ROOT = $PSScriptRoot
Set-Location $ROOT

Write-Host ""
Write-Host "  ADLC-Agent-Kit -- Team Panchayat" -ForegroundColor Cyan
Write-Host "  ──────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── Step 1: API Key ────────────────────────────────────────────────────────
$apiKey = $env:ANTHROPIC_API_KEY

# Try .env file if env var not set
if (-not $apiKey -or $apiKey.Length -lt 20) {
    $envFile = Join-Path $ROOT ".env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match "^ANTHROPIC_API_KEY=" }
        if ($line) { $apiKey = ($line -replace "^ANTHROPIC_API_KEY=","").Trim('"').Trim("'") }
    }
}

# Prompt if still not found
if (-not $apiKey -or $apiKey.Length -lt 20) {
    Write-Host "  No API key found." -ForegroundColor Yellow
    Write-Host "  Get yours at https://console.anthropic.com/" -ForegroundColor Gray
    Write-Host ""
    $apiKey = Read-Host "  Paste your ANTHROPIC_API_KEY (sk-ant-...)"
    $apiKey = $apiKey.Trim()
    if ($apiKey.Length -lt 20) {
        Write-Host "  Key too short -- aborting." -ForegroundColor Red
        Read-Host "Press Enter to exit"; exit 1
    }
    # Save permanently
    [System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $apiKey, "User")
    "ANTHROPIC_API_KEY=$apiKey" | Set-Content (Join-Path $ROOT ".env") -Encoding UTF8
    Write-Host "  Key saved permanently." -ForegroundColor Green
}

$env:ANTHROPIC_API_KEY = $apiKey
Write-Host "  [1/3] API key ready." -ForegroundColor Green

# ── Step 2: Kill anything on port 3000, start dashboard ───────────────────
$procs = netstat -ano | Select-String ":3000 " | ForEach-Object {
    ($_ -split '\s+')[-1]
} | Sort-Object -Unique
foreach ($pid in $procs) {
    if ($pid -match '^\d+$') {
        try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {}
    }
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$ROOT'; `$env:ANTHROPIC_API_KEY='$apiKey'; Write-Host '  Dashboard running at http://localhost:3000' -ForegroundColor Cyan; node dashboard-server.js" `
    -WindowStyle Normal

Start-Sleep -Seconds 2
Write-Host "  [2/3] Dashboard started -> http://localhost:3000" -ForegroundColor Green

# ── Step 3: Open browser ───────────────────────────────────────────────────
Start-Process "http://localhost:3000"

# ── Step 4: Open Arjun in a new window ────────────────────────────────────
$arjunPrompt = Join-Path $ROOT "prompts\arjun-prompt.txt"
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$ROOT'; `$env:ANTHROPIC_API_KEY='$apiKey'; Write-Host '  Arjun (PM) starting...' -ForegroundColor Magenta; `$prompt = Get-Content '$arjunPrompt' -Raw; claude --model claude-opus-4-6 --dangerously-skip-permissions `$prompt" `
    -WindowStyle Normal

Write-Host "  [3/3] Arjun window opened." -ForegroundColor Green
Write-Host ""
Write-Host "  All systems go. Check http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Start-Sleep -Seconds 2
