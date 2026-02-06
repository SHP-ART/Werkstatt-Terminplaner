@echo off
REM ========================================
REM  Manueller Build für v1.6.0 Release
REM ========================================

echo.
echo ======================================
echo   Werkstatt-Terminplaner v1.6.0 Build
echo ======================================
echo.

REM Erstelle Release-Verzeichnis
echo [1/5] Erstelle Release-Verzeichnis...
if not exist "release\v1.6.0" mkdir "release\v1.6.0"

REM Backend ist bereits gebaut
echo.
echo [2/5] Backend All-in-One bereits fertig!
echo       Datei: backend\dist-allinone\Werkstatt-Terminplaner-Setup-1.6.0.exe
if exist "backend\dist-allinone\Werkstatt-Terminplaner-Setup-1.6.0.exe" (
    copy "backend\dist-allinone\Werkstatt-Terminplaner-Setup-1.6.0.exe" "release\v1.6.0\" /Y > nul
    copy "backend\dist-allinone\latest.yml" "release\v1.6.0\latest-backend.yml" /Y > nul
    echo       ✓ Backend-Installer kopiert
) else (
    echo       ✗ Backend-Installer nicht gefunden!
    echo       Bitte Backend neu bauen: cd backend ^&^& npm run build:allinone
)

REM Tablet App 32-bit
echo.
echo [3/5] Baue Tablet App 32-bit...
cd electron-intern-tablet
call npx electron-builder --ia32 --win nsis
if %ERRORLEVEL% EQU 0 (
    echo       ✓ 32-bit Build erfolgreich
) else (
    echo       ✗ 32-bit Build fehlgeschlagen
)
cd ..

REM Tablet App 64-bit  
echo.
echo [4/5] Baue Tablet App 64-bit...
cd electron-intern-tablet
call npx electron-builder --x64 --win nsis
if %ERRORLEVEL% EQU 0 (
    echo       ✓ 64-bit Build erfolgreich
) else (
    echo       ✗ 64-bit Build fehlgeschlagen
)
cd ..

REM Kopiere Tablet-Installer
echo.
echo [5/5] Kopiere Tablet-Installer...
if exist "electron-intern-tablet\dist\Werkstatt-Intern-Setup-1.6.0-ia32.exe" (
    copy "electron-intern-tablet\dist\Werkstatt-Intern-Setup-1.6.0-ia32.exe" "release\v1.6.0\" /Y > nul
    echo       ✓ Tablet 32-bit kopiert
) else (
    echo       ✗ Tablet 32-bit nicht gefunden
)

if exist "electron-intern-tablet\dist\Werkstatt-Intern-Setup-1.6.0.exe" (
    copy "electron-intern-tablet\dist\Werkstatt-Intern-Setup-1.6.0.exe" "release\v1.6.0\" /Y > nul
    echo       ✓ Tablet 64-bit kopiert
) else (
    echo       ✗ Tablet 64-bit nicht gefunden
)

if exist "electron-intern-tablet\dist\latest.yml" (
    copy "electron-intern-tablet\dist\latest.yml" "release\v1.6.0\latest-tablet.yml" /Y > nul
    echo       ✓ latest.yml kopiert
)

echo.
echo ======================================
echo   Build abgeschlossen!
echo ======================================
echo.
echo Dateien in: release\v1.6.0\
dir /B release\v1.6.0\
echo.
echo Nächster Schritt: GitHub Release erstellen
echo   1. Git Tag erstellen: git tag v1.6.0
echo   2. Tag pushen: git push origin v1.6.0
echo   3. GitHub Release erstellen und Dateien hochladen
echo      https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/new
echo.
pause
