@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo ========================================
echo   Anim Desktop Pet - Starting...
echo ========================================
echo.
start "" pythonw "%~dp0animegirl.py"
echo Pet started!
echo Close this window - pet keeps running.
echo Right-click pet to exit.
echo.
timeout /t 3
