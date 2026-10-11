@echo off
title RITOS + ShopFlow Multi-Service Launcher
color 0A

echo =====================================================================
echo          RITOS ^& SHOPFLOW ONE-CLICK LOCAL LAUNCHER
echo =====================================================================
echo.
echo Starting all 4 services in dedicated terminal windows...
echo.

set ROOT_DIR=%~dp0

:: 1. RITOS Frontend (Port 5173)
echo [1/4] Launching RITOS Frontend (Port 5173)...
start "1. RITOS Frontend (Port 5173)" cmd /k "cd /d %ROOT_DIR%frontend && title RITOS Frontend :5173 && npm run dev"

:: 2. RITOS Backend (Port 8000)
echo [2/4] Launching RITOS Backend (Port 8000)...
start "2. RITOS Backend (Port 8000)" cmd /k "cd /d %ROOT_DIR%backend && title RITOS Backend :8000 && if exist ..\.venv\Scripts\activate.bat (call ..\.venv\Scripts\activate.bat) else (call .venv\Scripts\activate.bat) && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: 3. ShopFlow Frontend (Port 3000)
echo [3/4] Launching ShopFlow Storefront (Port 3000)...
start "3. ShopFlow Storefront (Port 3000)" cmd /k "cd /d %ROOT_DIR%shopflow && title ShopFlow Storefront :3000 && npm run dev -- -p 3000"

:: 4. ShopFlow Backend (Port 3001)
echo [4/4] Launching ShopFlow Backend API (Port 3001)...
start "4. ShopFlow Backend API (Port 3001)" cmd /k "cd /d %ROOT_DIR%shopflow && title ShopFlow Backend :3001 && node standalone-backend.js"

echo.
echo =====================================================================
echo               ALL 4 SERVICES HAVE BEEN LAUNCHED!
echo =====================================================================
echo.
echo   * RITOS Desk Portal:     http://localhost:5173
echo   * RITOS API / Swagger:   http://localhost:8000/docs
echo   * ShopFlow Demo Store:   http://localhost:3000
echo   * ShopFlow Backend API:  http://localhost:3001/api/health
echo.
echo Waiting 5 seconds before opening browser tabs...
timeout /t 5 >nul

start http://localhost:5173
start http://localhost:3000

echo Browser tabs launched. To stop all services, run stop_all.bat or close the 4 windows.
pause
