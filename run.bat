@echo off
title Github Uploader Launcher
echo ===================================================
echo             Github Uploader Launcher
echo ===================================================
echo.

:: Check python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python and try again.
    pause
    exit /b 1
)

:: Verify/install Flask and requests
echo [1/3] Checking dependencies...
python -c "import flask, requests" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing required libraries from requirements.txt...
    pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies. Please run 'pip install -r requirements.txt' manually.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Dependencies are already installed.
)

:: Create Github uploder directory if it doesn't exist
echo [2/3] Checking folder structure...
if not exist "Github uploder" (
    echo [INFO] Creating "Github uploder" folder...
    mkdir "Github uploder"
) else (
    echo [INFO] Folder "Github uploder" already exists.
)

:: Start Flask app and open browser
echo [3/3] Launching application...
echo [INFO] Starting Flask server...
start "" http://localhost:5000
python app.py

pause
