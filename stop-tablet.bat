@echo off
setlocal enabledelayedexpansion

REM Werkstatt Terminplaner - Tablet-App Stop Script (Windows)

echo ==========================================
echo    Tablet-App wird gestoppt              
echo ==========================================
echo.

set STOPPED=0

REM Stoppe Tablet-App ueber PID-Datei
if exist "logs\tablet.pid" (
    set /p TABLET_PID=<logs\tablet.pid
    
    REM Pruefe ob Prozess noch laeuft
    tasklist /FI "PID eq !TABLET_PID!" 2>nul | findstr /r "!TABLET_PID!" >nul
    if !errorlevel! equ 0 (
        echo [STOP] Stoppe Tablet-App (PID: !TABLET_PID!)...
        taskkill /PID !TABLET_PID! /T >nul 2>nul
        timeout /t 1 /nobreak >nul
        
        REM Pruefe ob Prozess noch laeuft
        tasklist /FI "PID eq !TABLET_PID!" 2>nul | findstr /r "!TABLET_PID!" >nul
        if !errorlevel! equ 0 (
            echo [FORCE] Erzwinge Beendigung...
            taskkill /PID !TABLET_PID! /F /T >nul 2>nul
        )
        
        echo [OK] Tablet-App gestoppt
        del logs\tablet.pid
        set STOPPED=1
    ) else (
        echo [INFO] Tablet-App laeuft nicht (PID nicht gefunden)
        del logs\tablet.pid
    )
) else (
    echo [INFO] Tablet PID-Datei nicht gefunden
)

REM Zusaetzlich: Finde und beende alle Electron-Prozesse der Tablet-App
for /f "tokens=2" %%i in ('wmic process where "commandline like '%%electron%%intern-tablet%%'" get processid /format:list 2^>nul ^| findstr "ProcessId"') do (
    set PID=%%i
    if not "!PID!"=="" (
        echo [STOP] Stoppe gefundenen Tablet-Prozess (PID: !PID!)...
        taskkill /PID !PID! /T >nul 2>nul
        timeout /t 1 /nobreak >nul
        
        REM Force kill falls noetig
        tasklist /FI "PID eq !PID!" 2>nul | findstr /r "!PID!" >nul
        if !errorlevel! equ 0 (
            taskkill /PID !PID! /F /T >nul 2>nul
        )
        set STOPPED=1
    )
)

if !STOPPED! equ 1 (
    echo [OK] Alle Tablet-Prozesse gestoppt
) else (
    echo [INFO] Tablet-App laeuft nicht
)

echo.
echo ==========================================
echo    Tablet-App gestoppt                   
echo ==========================================
echo.
pause
