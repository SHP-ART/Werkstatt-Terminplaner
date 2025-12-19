@echo off
REM Werkstatt Terminplaner - Start Script
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

REM Prüfe ob Python installiert ist
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python ist nicht installiert!
    echo Bitte installieren Sie Python von https://python.org
    pause
    exit /b 1
)

REM Backend-Dependencies installieren (falls noch nicht geschehen)
if not exist "backend\node_modules\" (
    echo [INFO] Installiere Backend-Dependencies...
    cd backend
    call npm install >nul 2>&1
    cd ..
    echo [OK] Backend-Dependencies installiert
)

REM Erstelle Logs-Verzeichnis
if not exist "logs\" mkdir logs

REM Prüfe ob Ports bereits belegt sind
netstat -ano | findstr ":3001" >nul
if %ERRORLEVEL% EQU 0 (
    echo [WARNUNG] Port 3001 (Backend) ist bereits belegt!
    echo Stoppen Sie zuerst den laufenden Server mit stop.bat
    pause
    exit /b 1
)

netstat -ano | findstr ":3000" >nul
if %ERRORLEVEL% EQU 0 (
    echo [WARNUNG] Port 3000 (Frontend) ist bereits belegt!
    echo Stoppen Sie zuerst den laufenden Server mit stop.bat
    pause
    exit /b 1
)

REM Starte Backend
echo [START] Starte Backend-Server auf Port 3001...
cd backend
start /B cmd /c "npm start > ..\logs\backend.log 2>&1"
cd ..
timeout /t 3 /nobreak >nul

REM Starte Frontend
echo [START] Starte Frontend-Server auf Port 3000...
cd frontend
start /B cmd /c "python -m http.server 3000 > ..\logs\frontend.log 2>&1"
cd ..
timeout /t 2 /nobreak >nul

echo.
echo ==========================================
echo   Server erfolgreich gestartet!
echo ==========================================
echo.
echo Frontend:  http://localhost:3000
echo Backend:   http://localhost:3001
echo API:       http://localhost:3001/api
echo.
echo Logs:
echo   Backend:  logs\backend.log
echo   Frontend: logs\frontend.log
echo.
echo Zum Stoppen: stop.bat
echo.

REM IP-Adresse anzeigen
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
if defined IP (
    echo Netzwerkzugriff:
    echo   http://%IP:~1%:3000
    echo.
)

echo Druecken Sie eine Taste um fortzufahren...
pause >nul
