@echo off
echo ========================================
echo Building Release v1.5.1
echo ========================================
echo.

echo [1/2] Building Server AllinOne Installer...
cd /d "%~dp0backend"
call npx electron-builder --config electron-builder-allinone.json
if errorlevel 1 (
    echo FEHLER: Server Build fehlgeschlagen!
    pause
    exit /b 1
)
echo.
echo [Server Build Done]
echo.

echo [2/2] Building Tablet App (32+64 bit)...
cd /d "%~dp0electron-intern-tablet"
call npm run build
if errorlevel 1 (
    echo FEHLER: Tablet Build fehlgeschlagen!
    pause
    exit /b 1
)
echo.
echo [Tablet Build Done]
echo.

echo ========================================
echo ALL BUILDS COMPLETE!
echo ========================================
echo.
echo Server Installer:
dir "%~dp0backend\dist-allinone\Werkstatt-Terminplaner-Setup-1.5.1.exe"
echo.
echo Tablet Installers:
dir "%~dp0electron-intern-tablet\dist\*.exe"
echo.
pause
