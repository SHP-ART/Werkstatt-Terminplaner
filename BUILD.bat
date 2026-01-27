@echo off
title Werkstatt Terminplaner Build v1.4.0
color 0A
echo ========================================
echo Werkstatt Terminplaner Build v1.4.0
echo ========================================
echo.
echo Dieser Build laeuft in einem isolierten Fenster
echo und sollte nicht durch SIGINT unterbrochen werden.
echo.
echo WICHTIG: Schliesse dieses Fenster NICHT manuell!
echo Warte bis "Build abgeschlossen" angezeigt wird.
echo.
pause

cd /d "%~dp0backend"

echo.
echo [1/2] Setze Umgebungsvariablen...
set CI=true
set CSC_IDENTITY_AUTO_DISCOVERY=false
set DEBUG=

echo [2/2] Starte Build (dauert ca. 3-5 Minuten)...
echo.
call npm run build:allinone

echo.
echo ========================================
if %errorlevel% EQU 0 (
    echo Build-Prozess beendet: Exit Code %errorlevel%
    if exist "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe" (
        color 0B
        echo.
        echo *** ERFOLG! Installer erstellt ***
        echo.
        dir "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe"
        echo.
        echo Dateien:
        dir "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.*"
        dir "dist-allinone\latest.yml"
    ) else (
        color 0C
        echo.
        echo *** FEHLER: Installer nicht gefunden ***
    )
) else (
    color 0C
    echo Build FEHLGESCHLAGEN: Exit Code %errorlevel%
)
echo ========================================
echo.
echo Druecke eine Taste zum Beenden...
pause >nul
