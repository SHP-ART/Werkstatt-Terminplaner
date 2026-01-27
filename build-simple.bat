@echo off
echo ========================================
echo Werkstatt Terminplaner Build v1.4.0
echo ========================================
echo.

REM Pruefe Admin-Rechte
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [WARNUNG] Keine Administrator-Rechte!
    echo.
    echo Build benoetigt Admin-Rechte wegen Windows Symlink-Einschraenkungen.
    echo.
    echo Optionen:
    echo 1. Dieses Skript mit Rechtsklick -^> "Als Administrator ausfuehren" starten
    echo 2. Windows Developer Mode aktivieren (Einstellungen -^> Update ^& Sicherheit -^> Entwickler)
    echo.
    set /p CONTINUE="Trotzdem versuchen? (J/N): "
    if /i not "%CONTINUE%"=="J" (
        echo Abgebrochen.
        pause
        exit /b 1
    )
) else (
    echo [OK] Als Administrator ausgefuehrt
)

echo.
echo Starte Build...
cd /d "%~dp0backend"
set CI=true
call npm run build:allinone
echo.
echo Build finished with exit code: %errorlevel%
echo.

if exist "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe" (
    echo ========================================
    echo SUCCESS: Installer erstellt!
    echo ========================================
    echo.
    dir "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe"
    echo.
    echo Naechste Schritte:
    echo 1. Installer lokal testen
    echo 2. Git Tag erstellen: git tag -a v1.4.0 -m "Release v1.4.0"
    echo 3. Tag pushen: git push origin v1.4.0
    echo 4. GitHub Release erstellen und Dateien hochladen
    echo.
) else (
    echo ========================================
    echo FEHLER: Installer wurde nicht erstellt!
    echo ========================================
    echo.
    echo Siehe build-full-log.txt fuer Details
)
pause
