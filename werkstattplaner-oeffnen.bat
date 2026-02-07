@echo off
echo ========================================
echo   Werkstatt-Terminplaner öffnen
echo ========================================
echo.

REM Pfad zur index.html
set "HTML_FILE=%~dp0frontend\index.html"

REM Prüfen ob die Datei existiert
if not exist "%HTML_FILE%" (
    echo FEHLER: index.html nicht gefunden!
    echo Pfad: %HTML_FILE%
    pause
    exit /b 1
)

echo Öffne Werkstattplaner...
start "" "%HTML_FILE%"

echo.
echo WICHTIG:
echo Wenn dies ein Client-PC ist, gehen Sie zu:
echo   Einstellungen ^> Server-Verbindung
echo und geben Sie die IP-Adresse des Server-PCs ein.
echo.
echo Wenn dies der Server-PC ist, verwenden Sie:
echo   start.bat
echo um den Server zu starten.
echo.

timeout /t 5
