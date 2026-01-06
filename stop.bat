@echo off
REM Werkstatt Terminplaner - Stop Script
REM Für Windows

echo ==========================================
echo   Werkstatt Terminplaner wird gestoppt
echo ==========================================
echo.

set STOPPED=0

REM Stoppe alle Node.js-Prozesse auf Port 3001
echo [CHECK] Pruefe Port 3001 (Backend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo [STOP] Stoppe Backend-Prozess (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Backend gestoppt
        set STOPPED=1
    )
)

REM Stoppe alle Python-Prozesse auf Port 3000
echo [CHECK] Pruefe Port 3000 (Frontend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo [STOP] Stoppe Frontend-Prozess (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Frontend gestoppt
        set STOPPED=1
    )
)

REM Alternative: Stoppe alle relevanten Node/Python-Prozesse
echo [CHECK] Suche nach verwandten Prozessen...

REM Stoppe Node-Prozesse die server.js ausführen
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.exe"') do (
    wmic process where ProcessId=%%a get CommandLine 2>nul | findstr "server.js" >nul
    if %ERRORLEVEL% EQU 0 (
        echo [STOP] Stoppe Node-Prozess (PID: %%a)...
        taskkill /F /PID %%a >nul 2>&1
        set STOPPED=1
    )
)

echo.
if %STOPPED% EQU 1 (
    echo ==========================================
    echo   Server erfolgreich gestoppt!
    echo ==========================================
) else (
    echo ==========================================
    echo   Keine laufenden Server gefunden
    echo ==========================================
)
echo.

pause
