@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   Anim Desktop Pet - Install
echo ========================================
echo.
echo [1/3] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found!
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo Python OK!
echo.
echo [2/3] Installing packages...
pip install PyQt6 requests psutil
if errorlevel 1 (
    pip3 install PyQt6 requests psutil
)
echo.
echo [3/3] Verifying...
python -c "import PyQt6; import requests; import psutil; print('All OK!')"
echo.
echo ========================================
echo   Done! Run run.bat to start
echo ========================================
pause
