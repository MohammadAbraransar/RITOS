@echo off
title Stop RITOS and ShopFlow Services
color 0C

echo =====================================================================
echo          STOPPING ALL RITOS ^& SHOPFLOW BACKGROUND PROCESSES
echo =====================================================================
echo.

echo Stopping services running on ports 5173, 8000, 3000, and 3001...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "foreach ($port in @(5173, 8000, 3000, 3001)) { ^
     try { ^
       $pids = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique; ^
       foreach ($p in $pids) { ^
         if ($p -and $p -ne 0) { ^
           Write-Host \"Stopping process on port $port (PID: $p)...\"; ^
           Stop-Process -Id $p -Force -ErrorAction SilentlyContinue ^
         } ^
       } ^
     } catch {} ^
   }"

echo.
echo All services have been stopped.
echo =====================================================================
pause
