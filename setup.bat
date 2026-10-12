@echo off
title RITOS + ShopFlow One-Click Initial Setup
color 0B

echo =====================================================================
echo          RITOS ^& SHOPFLOW ONE-CLICK INITIAL ENVIRONMENT SETUP
echo =====================================================================
echo.
echo This script will automatically:
echo   1. Verify Python and Node.js installations
echo   2. Create Python virtual environment (.venv)
echo   3. Install backend Python dependencies
echo   4. Initialize and migrate the SQLite database
echo   5. Install RITOS frontend dependencies (npm install)
echo   6. Install ShopFlow store dependencies (npm install)
echo.
echo =====================================================================
pause

set ROOT_DIR=%~dp0
cd /d %ROOT_DIR%

:: 1. Check Python
echo.
echo [1/6] Checking Python installation...
where python >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10+ from python.org and check "Add Python to PATH".
    pause
    exit /b 1
)
python --version

:: 2. Check Node & NPM
echo.
echo [2/6] Checking Node.js and NPM...
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js LTS from nodejs.org.
    pause
    exit /b 1
)
node --version
call npm --version

:: 3. Python Virtual Environment Setup
echo.
echo [3/6] Setting up Python virtual environment (.venv)...
if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment at .venv...
    python -m venv .venv
    if %errorlevel% neq 0 (
        color 0C
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
) else (
    echo Virtual environment already exists at .venv.
)

:: 4. Install Backend Dependencies & Migrate Database
echo.
echo [4/6] Installing backend Python packages and setting up database...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet
python -m pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to install backend dependencies!
    pause
    exit /b 1
)

if not exist "%ROOT_DIR%backend\.env" copy "%ROOT_DIR%backend\.env.example" "%ROOT_DIR%backend\.env" >nul
if not exist "%ROOT_DIR%frontend\.env" copy "%ROOT_DIR%frontend\.env.example" "%ROOT_DIR%frontend\.env" >nul

echo Initializing database schema and seed data...
cd /d "%ROOT_DIR%backend"
python -m app.seed
python migrate_db.py
cd /d "%ROOT_DIR%"

:: 5. Install RITOS Frontend Packages
echo.
echo [5/6] Installing RITOS Frontend dependencies (npm install)...
cd /d "%ROOT_DIR%frontend"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to install RITOS frontend packages!
    pause
    exit /b 1
)
cd /d "%ROOT_DIR%"

:: 6. Install ShopFlow Dependencies
echo.
echo [6/6] Installing ShopFlow Store dependencies (npm install)...
cd /d "%ROOT_DIR%shopflow"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to install ShopFlow packages!
    pause
    exit /b 1
)
if not exist "%ROOT_DIR%shopflow\.env" copy "%ROOT_DIR%shopflow\.env.example" "%ROOT_DIR%shopflow\.env" >nul

:: ShopFlow store database: Supabase or any Postgres configured in shopflow\.env
findstr /C:"<project-ref>" "%ROOT_DIR%shopflow\.env" >nul
if %errorlevel% equ 0 (
    echo.
    echo [ACTION NEEDED] shopflow\.env still has placeholder database URLs.
    echo Paste your Supabase connection strings into shopflow\.env, then run setup.bat again.
) else (
    echo Creating ShopFlow tables and seed data in Postgres...
    call npx prisma db push --skip-generate
    call npx prisma generate
    call npm run db:seed
)
cd /d "%ROOT_DIR%"

echo.
echo =====================================================================
echo                      SETUP COMPLETED SUCCESSFULLY!
echo =====================================================================
echo.
echo All backend packages, database tables, and frontend modules are ready!
echo.
echo NEXT STEP:
echo   Double-click "start_all.bat" to launch all 3 services with 1 click.
echo.
pause
