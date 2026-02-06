@echo off
cd /d "%~dp0electron-intern-tablet"
echo Building Tablet App v1.5.5...
call npx electron-builder --win --ia32 --x64 --publish never
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
echo Build complete!
dir dist\Werkstatt-Intern-Setup-1.5.5*.exe
pause
