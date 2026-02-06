@echo off
REM ========================================
REM Automatischer Build + Update-Registrierung
REM Tablet-App
REM ========================================

echo ========================================
echo   Tablet-App Build + Registrierung
echo ========================================
echo.

REM Version aus package.json auslesen
for /f "tokens=2 delims=:, " %%a in ('findstr /C:"\"version\"" package.json') do set VERSION=%%a
set VERSION=%VERSION:"=%

echo Version: %VERSION%
echo.

REM 1. Build erstellen
echo [1/3] Baue Tablet-App...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo FEHLER: Build fehlgeschlagen!
    pause
    exit /b 1
)

echo.
echo [OK] Build erfolgreich!
echo.

REM 2. Installer-Datei finden
echo [2/3] Suche Installer-Datei...
set INSTALLER_PATH=
for /f "delims=" %%a in ('dir /b /s dist\Werkstatt-Intern-Setup-%VERSION%-x64.exe 2^>nul') do set INSTALLER_PATH=%%a

if "%INSTALLER_PATH%"=="" (
    echo.
    echo WARNUNG: Installer nicht gefunden!
    echo Erwartet: dist\Werkstatt-Intern-Setup-%VERSION%-x64.exe
    echo.
    echo Build-Dateien in dist:
    dir dist\*.exe /b
    echo.
    pause
    exit /b 1
)

echo [OK] Installer gefunden: %INSTALLER_PATH%
echo.

REM 3. Am Server registrieren
echo [3/3] Registriere Update am Server...
echo.

REM Server-URL (anpassen falls nötig)
set SERVER_URL=http://localhost:3001

REM Release Notes (optional anpassen)
set RELEASE_NOTES=Automatisches Update: Version %VERSION%

REM Escapen des Pfads für JSON (Backslashes verdoppeln)
set ESCAPED_PATH=%INSTALLER_PATH:\=\\%

REM JSON erstellen
echo { > temp_update.json
echo   "version": "%VERSION%", >> temp_update.json
echo   "filePath": "%ESCAPED_PATH%", >> temp_update.json
echo   "releaseNotes": "%RELEASE_NOTES%" >> temp_update.json
echo } >> temp_update.json

REM API-Call mit curl
curl -X POST %SERVER_URL%/api/tablet-update/register ^
  -H "Content-Type: application/json" ^
  -d @temp_update.json

REM Temp-Datei löschen
del temp_update.json

echo.
echo.
echo ========================================
echo   FERTIG!
echo ========================================
echo.
echo Update erfolgreich registriert:
echo   Version:  %VERSION%
echo   Datei:    %INSTALLER_PATH%
echo   Server:   %SERVER_URL%
echo.
echo Die Tablets werden beim nächsten Check
echo (innerhalb von 30 Minuten) benachrichtigt.
echo.
echo Tablet-Status prüfen:
echo   %SERVER_URL%/api/tablet-update/status
echo.
pause
