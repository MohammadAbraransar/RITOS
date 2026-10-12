@echo off
title RITOS + ShopFlow Multi-Service Launcher
color 0A

echo =====================================================================
echo          RITOS ^& SHOPFLOW ONE-CLICK LOCAL LAUNCHER
echo =====================================================================
echo.

set ROOT_DIR=%~dp0

:: Check if setup has been run
if not exist "%ROOT_DIR%.venv\Scripts\activate.bat" (
    color 0C
    echo [WARNING] Python virtual environment was not found!
    echo Please run "setup.bat" first to install dependencies and migrate the database.
    echo.
    choice /M "Would you like to run setup.bat right now"
    if errorlevel 2 goto :skip_setup
    call "%ROOT_DIR%setup.bat"
)
:skip_setup

echo Checking and freeing ports 5173, 8000, 3000, and 3001 to prevent conflicts...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%scripts\kill_ports.ps1"

timeout /t 1 >nul

echo Starting all 3 services in dedicated terminal windows...
echo.

echo [1/4] Launching RITOS Frontend (Port 5173)...
start "1. RITOS Frontend (Port 5173)" cmd /k "cd /d "%ROOT_DIR%frontend" && npm run dev"

:: 2. RITOS Backend (Port 8000)
echo [2/4] Launching RITOS Backend (Port 8000)...
start "2. RITOS Backend (Port 8000)" cmd /k "cd /d "%ROOT_DIR%backend" && "%ROOT_DIR%.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: 3. ShopFlow Frontend (Port 3000)
echo [3/4] Launching ShopFlow Storefront (Port 3000)...
start "3. ShopFlow Storefront (Port 3000)" cmd /k "cd /d "%ROOT_DIR%shopflow" && npm run dev -- -p 3000"

:: 4. ShopFlow Backend (Port 3001)
echo [4/4] Launching ShopFlow Backend API (Port 3001)...
start "4. ShopFlow Backend API (Port 3001)" cmd /k "cd /d "%ROOT_DIR%shopflow" && node standalone-backend.js"

echo.
echo =====================================================================
echo               ALL 3 SERVICES HAVE BEEN LAUNCHED!
echo =====================================================================
echo.
echo   * RITOS Desk Portal:     http://localhost:5173
echo   * RITOS API / Swagger:   http://localhost:8000/docs
echo   * ShopFlow Demo Store:   http://localhost:3000
echo   * ShopFlow Health:       http://localhost:3000/api/health
echo.
echo Waiting 5 seconds before opening browser tabs...
timeout /t 5 >nul

start http://localhost:5173
start http://localhost:3000

echo Browser tabs launched. To stop all services, run stop_all.bat or close the 3 windows.
pause
