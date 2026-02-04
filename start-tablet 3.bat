@echo off
setlocal enabledelayedexpansion

REM Werkstatt Terminplaner - Tablet-App Start Script (Windows)

echo ==========================================
echo    Tablet-App wird gestartet             
echo ==========================================
echo.

REM Pruefe ob Node.js installiert ist
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js ist nicht installiert!
    echo Bitte installieren Sie Node.js von https://nodejs.org
    pause
    exit /b 1
)

REM Pruefe ob npm installiert ist
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm ist nicht installiert!
    echo Bitte installieren Sie Node.js von https://nodejs.org
    pause
    exit /b 1
)

REM Pruefe ob Backend laeuft
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNUNG] Backend laeuft nicht auf Port 3001!
    echo [INFO] Starten Sie zuerst das Backend mit start.bat
    echo.
    set /p REPLY="Backend jetzt starten? (j/n): "
    if /i "!REPLY!"=="j" (
        echo [INFO] Starte Backend...
        start "" cmd /c start.bat
        timeout /t 5 /nobreak >nul
    ) else (
        echo [ABBRUCH] Tablet-App benoetigt laufendes Backend
        pause
        exit /b 1
    )
)

REM Tablet-Dependencies installieren (falls noch nicht geschehen)
if not exist "electron-intern-tablet\node_modules" (
    echo [INFO] Installiere Tablet-Dependencies...
    cd electron-intern-tablet
    call npm install >nul 2>&1
    cd ..
    echo [OK] Tablet-Dependencies installiert
)

REM Pruefe ob Tablet-App bereits laeuft
wmic process where "commandline like '%%electron%%intern-tablet%%'" get processid 2>nul | findstr /r "[0-9]" >nul 2>nul
if %errorlevel% equ 0 (
    echo [WARNUNG] Tablet-App laeuft bereits!
    echo Stoppen Sie zuerst die laufende App mit stop-tablet.bat
    pause
    exit /b 1
)

REM Erstelle Logs-Verzeichnis
if not exist "logs" mkdir logs

REM Starte Tablet-App
echo [START] Starte Tablet-App...
cd electron-intern-tablet

REM Starte Electron im Hintergrund und speichere PID
start "" /min cmd /c "npm start > ..\logs\tablet.log 2>&1"

REM Warte kurz und hole PID
timeout /t 2 /nobreak >nul

for /f "tokens=2" %%i in ('wmic process where "commandline like '%%electron%%intern-tablet%%'" get processid /format:list ^| findstr "ProcessId"') do (
    set TABLET_PID=%%i
)

cd ..

if not "!TABLET_PID!"=="" (
    echo !TABLET_PID! > logs\tablet.pid
    echo [OK] Tablet-App gestartet (PID: !TABLET_PID!)
    echo.
    echo [INFO] Logs: type logs\tablet.log
    echo [INFO] Stoppen: stop-tablet.bat
    echo.
) else (
    echo [ERROR] Tablet-App konnte nicht gestartet werden
    echo Pruefen Sie die Logs: type logs\tablet.log
    if exist logs\tablet.pid del logs\tablet.pid
    pause
    exit /b 1
)

echo ==========================================
echo    Tablet-App laeuft
echo ==========================================
echo.
pause
