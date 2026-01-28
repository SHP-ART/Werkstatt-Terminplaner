@echo off
REM Werkstatt Terminplaner - Start Script (Electron All-in-One)
REM Für Windows

echo ==========================================
echo   Werkstatt Terminplaner wird gestartet
echo ==========================================
echo.

REM Prüfe ob Node.js installiert ist
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js ist nicht installiert!
    echo Bitte installieren Sie Node.js von https://nodejs.org
    pause
    exit /b 1
)

REM Backend-Dependencies installieren (falls noch nicht geschehen)
if not exist "backend\node_modules\" (
    echo [INFO] Installiere Backend-Dependencies...
    cd backend
    call npm install
    cd ..
    echo [OK] Backend-Dependencies installiert
)

REM Prüfe ob Port bereits belegt ist
netstat -ano | findstr ":3001" >nul
if %ERRORLEVEL% EQU 0 (
    echo [WARNUNG] Port 3001 ist bereits belegt!
    echo Stoppen Sie zuerst den laufenden Server mit stop.bat
    pause
    exit /b 1
)

echo.
echo [START] Starte Electron App (Server + Frontend)...
echo.

REM Starte Electron All-in-One App
cd backend
call npm start

REM Falls Electron beendet wird
cd ..
echo.
echo ==========================================
echo   Werkstatt Terminplaner beendet
echo ==========================================
pause
