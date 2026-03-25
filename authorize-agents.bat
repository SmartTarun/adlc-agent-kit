@echo off
:: ============================================================
:: ADLC-Agent-Kit | Team Panchayat -- Console Authorization
:: Double-click or run from CMD to authorize all agents.
:: Run ONCE before first use.
:: ============================================================
echo.
echo  Launching Team Panchayat Authorization Setup...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0authorize-agents.ps1"
