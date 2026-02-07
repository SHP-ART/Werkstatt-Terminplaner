@echo off
echo ========================================
echo Werkstatt Intern - Tablet App Builder
echo ========================================
echo.

REM Prüfe ob Node installiert ist
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo FEHLER: Node.js ist nicht installiert!
    echo Bitte installiere Node.js von https://nodejs.org
    pause
    exit /b 1
)

REM Prüfe ob npm installiert ist
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo FEHLER: npm ist nicht installiert!
    pause
    exit /b 1
)

echo [1/3] Installiere Abhängigkeiten...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo FEHLER bei npm install!
    pause
    exit /b 1
)

echo.
echo [2/3] Erstelle Windows Build...
call npm run build:win
if %ERRORLEVEL% NEQ 0 (
    echo FEHLER beim Build!
    pause
    exit /b 1
)

echo.
echo [3/3] Build abgeschlossen!
echo.
echo Die fertigen Installer befinden sich in:
echo   %CD%\dist\
echo.
echo Kopiere diese Datei auf das Tablet.
echo.
pause
