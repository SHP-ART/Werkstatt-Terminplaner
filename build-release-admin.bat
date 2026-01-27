@echo off
echo ========================================
echo Werkstatt Terminplaner - Release Build
echo Version 1.4.0 (erfordert Admin-Rechte)
echo ========================================
echo.

REM Pruefe auf Admin-Rechte
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Als Administrator ausgefuehrt
    echo.
) else (
    echo [FEHLER] Dieses Skript benoetigt Administrator-Rechte!
    echo Bitte mit Rechtsklick -^> "Als Administrator ausfuehren" starten
    echo.
    pause
    exit /b 1
)

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
echo Dies kann mehrere Minuten dauern...
set CI=true
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
    echo.
    echo Naechste Schritte:
    echo 1. Teste den Installer lokal
    echo 2. Erstelle einen GitHub Release (Tag v1.4.0)
    echo 3. Lade die Dateien hoch:
    echo    - Werkstatt-Terminplaner-Setup-1.4.0.exe
    echo    - latest.yml
    echo.
) else (
    echo WARNUNG: Installer-Datei nicht gefunden!
)

echo.
echo Fertig! Druecke eine Taste...
pause
