@echo off
echo ========================================
echo Werkstatt Terminplaner - Release Build
echo Version 1.4.0
echo ========================================
echo.

cd /d "%~dp0backend"

echo [1/3] Pruefe Dependencies...
call npm install
if errorlevel 1 (
    echo FEHLER: npm install fehlgeschlagen
    pause
    exit /b 1
)

echo.
echo [2/3] Erstelle All-in-One Installer...
call npm run build:allinone
if errorlevel 1 (
    echo FEHLER: Build fehlgeschlagen
    pause
    exit /b 1
)

echo.
echo [3/3] Pruefe erstellte Dateien...
if exist "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe" (
    echo ========================================
    echo BUILD ERFOLGREICH!
    echo ========================================
    echo.
    echo Installer erstellt:
    dir "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe"
    echo.
    echo latest.yml fuer Auto-Update:
    type "dist-allinone\latest.yml"
    echo.
) else (
    echo WARNUNG: Installer-Datei nicht gefunden!
)

echo.
echo Fertig! Druecke eine Taste...
pause
