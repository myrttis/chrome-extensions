@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo ========================================
echo   Anim Desktop Pet - Package
echo ========================================
echo.
echo [1/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found!
    pause
    exit /b 1
)
echo [2/4] Installing PyInstaller...
pip install pyinstaller -q
echo [3/4] Building...
pyinstaller --onefile --windowed --name "AnimPet" --add-data "idle.png;." --add-data "talk.png;." animegirl.py
echo.
echo [4/4] Done!
if exist "dist\AnimPet.exe" (
    echo Build OK! File: dist\AnimPet.exe
    explorer dist
) else (
    echo Build failed, check errors above.
)
pause
