@echo off
REM ========================================
REM Tablet-App Update hochladen und registrieren
REM ========================================
echo.
echo Tablet-App Update Upload
echo ========================
echo.

REM Prüfe ob Build vorhanden ist
if not exist "dist\Werkstatt-Intern-Setup-1.6.2-ia32.exe" (
    echo FEHLER: Build nicht gefunden!
    echo Bitte erst "npm run build:win" ausfuehren.
    pause
    exit /b 1
)

REM Tailscale-Server
set SERVER_IP=100.124.168.108
set SHARE_PATH=\\%SERVER_IP%\Werkstatt-Upload
set BACKEND_URL=http://192.168.0.57:3001

REM Prüfe Verbindung
echo Pruefe Verbindung zu %SHARE_PATH%...
net use %SHARE_PATH% /user:werkstatt Werkstatt2024! >nul 2>&1

REM Kopiere beide Versionen
echo.
echo [1/3] Kopiere 32-Bit Version...
copy /Y "dist\Werkstatt-Intern-Setup-1.6.2-ia32.exe" "%SHARE_PATH%\" >nul
if errorlevel 1 (
    echo FEHLER: Upload fehlgeschlagen!
    pause
    exit /b 1
)
echo         OK - Werkstatt-Intern-Setup-1.6.2-ia32.exe

echo.
echo [2/3] Kopiere 64-Bit Version...
copy /Y "dist\Werkstatt-Intern-Setup-1.6.2-x64.exe" "%SHARE_PATH%\" >nul
echo         OK - Werkstatt-Intern-Setup-1.6.2-x64.exe

REM Registriere Update auf dem Backend
echo.
echo [3/3] Registriere Update auf dem Server...
curl -X POST "%BACKEND_URL%/api/tablet-update/register" ^
  -H "Content-Type: application/json" ^
  -d "{\"version\":\"1.6.2\",\"filePath\":\"/opt/werkstatt-upload/Werkstatt-Intern-Setup-1.6.2-ia32.exe\",\"releaseNotes\":\"Automatisches Update von GitHub v1.5.9\"}"

echo.
echo.
echo ========================================
echo UPLOAD ERFOLGREICH!
echo ========================================
echo.
echo Die Tablets werden beim naechsten Check automatisch aktualisiert.
echo.
pause
