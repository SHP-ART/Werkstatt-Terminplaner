@echo off
echo ========================================
echo   Werkstatt-Terminplaner Server
echo ========================================
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

echo Starte Electron-App mit Server-Status-Fenster...
echo.

npm start
