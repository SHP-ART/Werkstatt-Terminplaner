@echo off
REM GitHub Release Upload Script
REM Benötigt: GitHub CLI (gh) - https://cli.github.com/

echo ========================================
echo GitHub Release Upload
echo ========================================
echo.

REM Prüfe ob GitHub CLI installiert ist
where gh >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo FEHLER: GitHub CLI (gh) ist nicht installiert!
    echo.
    echo Bitte installieren Sie GitHub CLI von:
    echo https://cli.github.com/
    echo.
    echo Oder laden Sie die Dateien manuell hoch:
    echo 1. Gehe zu https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/new
    echo 2. Tag: v1.0.1
    echo 3. Titel: Release v1.0.1 - ICU Error Fix
    echo 4. Beschreibung aus RELEASE-NOTES.md kopieren
    echo 5. Dateien hochladen aus: release\
    echo.
    pause
    exit /b 1
)

echo GitHub CLI gefunden!
echo.

REM Prüfe ob eingeloggt
gh auth status >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Sie sind nicht bei GitHub eingeloggt.
    echo Bitte melden Sie sich an:
    echo.
    gh auth login
    if %ERRORLEVEL% NEQ 0 (
        echo Login fehlgeschlagen!
        pause
        exit /b 1
    )
)

echo.
echo Sie sind bei GitHub eingeloggt!
echo.

REM Variablen setzen
set TAG=v1.0.5
set TITLE=Release v1.0.5 - Autostart, Version display, Nur Service calculation
set REPO=SHP-ART/Werkstatt-Terminplaner

echo Repository: %REPO%
echo Tag: %TAG%
echo Titel: %TITLE%
echo.
echo Dateien die hochgeladen werden:
dir /b release\*.exe
echo.

set /p CONFIRM="Möchten Sie das Release erstellen? (J/N): "
if /i not "%CONFIRM%"=="J" (
    echo Abgebrochen.
    pause
    exit /b 0
)

echo.
echo Erstelle Release...
echo.

REM Erstelle Release mit Dateien
gh release create %TAG% ^
    --repo %REPO% ^
    --title "%TITLE%" ^
    --notes-file RELEASE-NOTES.md ^
    release\Werkstatt-Terminplaner-Complete.exe ^
    release\Werkstatt-Server.exe ^
    release\Werkstatt-Frontend-Backend.exe ^
    release\Werkstatt-Frontend.exe

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Release erfolgreich erstellt!
    echo ========================================
    echo.
    echo Release ansehen:
    echo https://github.com/%REPO%/releases/tag/%TAG%
    echo.
) else (
    echo.
    echo FEHLER: Release konnte nicht erstellt werden!
    echo.
    echo Mögliche Probleme:
    echo - Tag existiert bereits (lösche ihn zuerst mit: gh release delete %TAG%)
    echo - Keine Berechtigung für das Repository
    echo - Netzwerkfehler
    echo.
)

pause
