@echo off
title Stop RITOS and ShopFlow Services
color 0C

echo =====================================================================
echo          STOPPING ALL RITOS ^& SHOPFLOW BACKGROUND PROCESSES
echo =====================================================================
echo.

set ROOT_DIR=%~dp0

echo Stopping services running on ports 5173, 8000, 3000, and 3001...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%scripts\kill_ports.ps1"

echo.
echo All services have been stopped.
echo =====================================================================
pause
