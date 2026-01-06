@echo off
REM Starte die gepackte Electron-App aus dem richtigen Verzeichnis
cd /d "%~dp0"
cd backend\dist-allinone\win-unpacked

echo Starte Werkstatt Terminplaner...
echo.
echo Falls der Server nicht startet, prüfe:
echo - Ist Port 3001 bereits belegt?
echo - Liegen alle Dateien im win-unpacked Ordner?
echo.

start "" "Werkstatt Terminplaner.exe"

echo.
echo Die App wurde gestartet!
echo Sie können dieses Fenster schließen.
echo.
pause
