@echo off
echo ========================================
echo   Werkstatt-Terminplaner Server
echo ========================================
echo.
echo Server wird gestartet...
echo.

REM Speichere das Startverzeichnis für Daten
set "DATA_DIR=%~dp0"
echo Daten-Verzeichnis: %DATA_DIR%
echo.

cd /d "%~dp0backend"

REM Prüfen ob Node.js installiert ist
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo FEHLER: Node.js ist nicht installiert!
    echo Bitte installieren Sie Node.js von https://nodejs.org/
    pause
    exit /b 1
)

REM Prüfen ob node_modules existiert
if not exist "node_modules" (
    echo Erstmaliger Start: Installiere Abhängigkeiten...
    call npm install
    if %errorlevel% neq 0 (
        echo FEHLER: Installation fehlgeschlagen!
        pause
        exit /b 1
    )
)

echo.
echo Server läuft jetzt!
echo.
echo Zugriff auf diesem PC:
echo   http://localhost:3001
echo.
echo Zugriff von anderen PCs im Netzwerk:
echo   http://[IHRE-IP-ADRESSE]:3001
echo.
echo Um Ihre IP-Adresse zu finden, öffnen Sie ein neues Terminal
echo und geben Sie ein: ipconfig
echo Suchen Sie nach "IPv4-Adresse"
echo.
echo Drücken Sie Strg+C zum Beenden
echo ========================================
echo.

node src/server.js

pause
