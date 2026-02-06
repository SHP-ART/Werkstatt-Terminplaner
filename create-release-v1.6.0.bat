@echo off
REM ========================================
REM Release Build v1.6.0
REM All-in-One + Tablet App (32/64bit)
REM ========================================

echo.
echo ╔════════════════════════════════════════╗
echo ║  Werkstatt Terminplaner v1.6.0        ║
echo ║  Release Build                         ║
echo ╚════════════════════════════════════════╝
echo.

REM Prüfe ob Git installiert ist
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ FEHLER: Git ist nicht installiert!
    pause
    exit /b 1
)

REM Prüfe ob GitHub CLI installiert ist
where gh >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  WARNUNG: GitHub CLI (gh) ist nicht installiert!
    echo    GitHub Release muss manuell erstellt werden.
    echo.
    set NO_GH=1
) else (
    set NO_GH=0
)

REM Git Status prüfen
echo [📋] Prüfe Git Status...
git status --porcelain >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ FEHLER: Nicht in einem Git Repository!
    pause
    exit /b 1
)

REM Uncommitted changes?
for /f %%i in ('git status --porcelain ^| find /c /v ""') do set CHANGES=%%i
if %CHANGES% gtr 0 (
    echo ⚠️  WARNUNG: Es gibt nicht-committete Änderungen!
    echo.
    git status --short
    echo.
    choice /C YN /M "Trotzdem fortfahren"
    if errorlevel 2 exit /b 0
)

echo ✅ Git Status OK
echo.

REM Release-Verzeichnis erstellen
set RELEASE_DIR=release\v1.6.0
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

echo ╔════════════════════════════════════════╗
echo ║  [1/3] Backend All-in-One Build       ║
echo ╚════════════════════════════════════════╝
echo.

cd backend

REM Dependencies prüfen
if not exist "node_modules" (
    echo [📦] Installiere Backend Dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Backend npm install fehlgeschlagen!
        cd ..
        pause
        exit /b 1
    )
)

REM Build All-in-One
echo [🔨] Baue All-in-One Setup...
call npm run build:allinone
if %errorlevel% neq 0 (
    echo ❌ All-in-One Build fehlgeschlagen!
    cd ..
    pause
    exit /b 1
)

echo ✅ All-in-One Build erfolgreich!
echo.

REM Kopiere All-in-One Setup
echo [📦] Kopiere All-in-One Setup...
if exist "dist-allinone\Werkstatt-Terminplaner-Setup-1.6.0.exe" (
    copy /Y "dist-allinone\Werkstatt-Terminplaner-Setup-1.6.0.exe" "..\%RELEASE_DIR%\"
    echo ✅ Kopiert: Werkstatt-Terminplaner-Setup-1.6.0.exe
) else (
    echo ❌ All-in-One Setup nicht gefunden!
    cd ..
    pause
    exit /b 1
)

REM Kopiere latest.yml für Auto-Update
if exist "dist-allinone\latest.yml" (
    copy /Y "dist-allinone\latest.yml" "..\%RELEASE_DIR%\"
    echo ✅ Kopiert: latest.yml
)

cd ..
echo.

echo ╔════════════════════════════════════════╗
echo ║  [2/3] Tablet App Build (32/64bit)    ║
echo ╚════════════════════════════════════════╝
echo.

cd electron-intern-tablet

REM Dependencies prüfen
if not exist "node_modules" (
    echo [📦] Installiere Tablet Dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Tablet npm install fehlgeschlagen!
        cd ..
        pause
        exit /b 1
    )
)

REM Build Tablet App
echo [🔨] Baue Tablet App (32-bit + 64-bit)...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Tablet Build fehlgeschlagen!
    cd ..
    pause
    exit /b 1
)

echo ✅ Tablet Build erfolgreich!
echo.

REM Kopiere Tablet Installer
echo [📦] Kopiere Tablet Installer...
set TABLET_COPIED=0

if exist "dist\Werkstatt-Intern-Setup-1.6.0-ia32.exe" (
    copy /Y "dist\Werkstatt-Intern-Setup-1.6.0-ia32.exe" "..\%RELEASE_DIR%\"
    echo ✅ Kopiert: Werkstatt-Intern-Setup-1.6.0-ia32.exe (32-bit)
    set TABLET_COPIED=1
)

if exist "dist\Werkstatt-Intern-Setup-1.6.0-x64.exe" (
    copy /Y "dist\Werkstatt-Intern-Setup-1.6.0-x64.exe" "..\%RELEASE_DIR%\"
    echo ✅ Kopiert: Werkstatt-Intern-Setup-1.6.0-x64.exe (64-bit)
    set TABLET_COPIED=1
)

if %TABLET_COPIED%==0 (
    echo ❌ Keine Tablet Installer gefunden!
    cd ..
    pause
    exit /b 1
)

cd ..
echo.

REM Release Notes erstellen
echo [📝] Erstelle Release Notes...
(
echo # Werkstatt Terminplaner v1.6.0
echo.
echo ## 🎉 Neue Features
echo.
echo ### Remote-Update-System für Tablet-Apps
echo - 🔄 Zentrale Update-Verwaltung vom Server aus
echo - 📱 Tablets prüfen automatisch alle 30 Minuten auf Updates
echo - 💡 Update-Benachrichtigung mit Ein-Klick-Installation
echo - 📊 Übersicht über alle Tablet-Versionen und Status
echo.
echo ### Persistente Einstellungen
echo - 💾 Einstellungen bleiben bei Updates erhalten
echo - 🔧 Gespeichert im userData-Verzeichnis
echo - ✅ Kein Datenverlust mehr bei Neuinstallation
echo.
echo ## 🔧 Technische Verbesserungen
echo.
echo ### Backend
echo - Neue API-Endpunkte für Tablet-Update-Verwaltung
echo - `GET /api/tablet-update/check` - Update-Prüfung
echo - `GET /api/tablet-update/download` - Update-Download
echo - `POST /api/tablet-update/register` - Update registrieren
echo - `GET /api/tablet-update/status` - Status aller Tablets
echo - Automatische Datenbank-Tabellen für Update-Tracking
echo.
echo ### Tablet-App
echo - Auto-Update-Check alle 30 Minuten
echo - Einstellungen in persistentem userData-Verzeichnis
echo - Update-Download und Installation mit einem Klick
echo - Automatische Status-Meldung an Server
echo - Node.js-kompatible HTTP-Requests (keine fetch-Abhängigkeit^)
echo.
echo ## 📦 Downloads
echo.
echo ### Haupt-Anwendung (Server + Admin-Panel^)
echo - `Werkstatt-Terminplaner-Setup-1.6.0.exe` - All-in-One Installer (64-bit^)
echo.
echo ### Tablet-App (Team-Übersicht Vollbild^)
echo - `Werkstatt-Intern-Setup-1.6.0-x64.exe` - 64-bit Version
echo - `Werkstatt-Intern-Setup-1.6.0-ia32.exe` - 32-bit Version
echo.
echo ## 📚 Dokumentation
echo.
echo - [TABLET-REMOTE-UPDATE.md](TABLET-REMOTE-UPDATE.md^) - Komplette Dokumentation des Update-Systems
echo - [TABLET-EINSTELLUNGEN-FIX.md](TABLET-EINSTELLUNGEN-FIX.md^) - Fix für persistente Einstellungen
echo - [electron-intern-tablet/README-UPDATE.md](electron-intern-tablet/README-UPDATE.md^) - Build ^& Update Anleitung
echo.
echo ## ⚙️ Installation
echo.
echo ### Haupt-Anwendung
echo 1. `Werkstatt-Terminplaner-Setup-1.6.0.exe` herunterladen
echo 2. Als Administrator ausführen
echo 3. Installationsanweisungen folgen
echo.
echo ### Tablet-App
echo 1. Passende Version herunterladen (32-bit oder 64-bit^)
echo 2. Auf Tablet installieren
echo 3. Backend-URL in Einstellungen konfigurieren
echo 4. Fertig! Auto-Updates funktionieren ab jetzt automatisch
echo.
echo ## 🔄 Update von vorheriger Version
echo.
echo ### Server/Admin-Panel
echo - Einfach neue Version installieren
echo - Datenbank wird automatisch migriert
echo - Einstellungen bleiben erhalten
echo.
echo ### Tablet-App
echo - **NEU:** Ab sofort automatische Updates!
echo - Einstellungen bleiben bei Updates erhalten
echo - Für dieses erste Update: Manuell installieren
echo - Danach: Automatische Updates über Server
echo.
echo ## 🐛 Bugfixes
echo.
echo - ✅ Tablet-Einstellungen werden nicht mehr bei Installation gelöscht
echo - ✅ Fehlerbehandlung bei fehlender werkstatt_einstellungen Tabelle
echo - ✅ SQLite db.exec durch db.serialize ersetzt (Kompatibilität^)
echo.
echo ## 🚀 Für Entwickler
echo.
echo ### Neue Dateien
echo - `backend/src/controllers/tabletUpdateController.js`
echo - `backend/src/models/tabletUpdateModel.js`
echo - `backend/src/routes/tabletUpdateRoutes.js`
echo - `electron-intern-tablet/build-and-register.bat`
echo - `electron-intern-tablet/build-and-register.ps1`
echo - `electron-intern-tablet/register-update.js`
echo.
echo ### Build-Skripte
echo ```bash
echo # All-in-One Build
echo cd backend
echo npm run build:allinone
echo.
echo # Tablet App Build + Auto-Registrierung
echo cd electron-intern-tablet
echo npm run build:auto
echo ```
echo.
echo ## ✅ Getestet auf
echo.
echo - Windows 10 (64-bit^)
echo - Windows 11 (64-bit^)
echo - Windows Tablets (32-bit und 64-bit^)
echo.
echo ## 📝 Version Info
echo.
echo - **Version:** 1.6.0
echo - **Release-Datum:** 2026-02-06
echo - **Branch:** master
echo - **Commit:** [wird automatisch gesetzt]
echo.
echo ---
echo.
echo 💡 **Tipp:** Vollständige Dokumentation in den verlinkten Markdown-Dateien!
) > "%RELEASE_DIR%\RELEASE-NOTES.md"

echo ✅ Release Notes erstellt
echo.

echo ╔════════════════════════════════════════╗
echo ║  [3/3] GitHub Release                  ║
echo ╚════════════════════════════════════════╝
echo.

REM Dateien auflisten
echo 📦 Release-Dateien:
echo.
dir /B "%RELEASE_DIR%\*.exe"
dir /B "%RELEASE_DIR%\*.yml" 2>nul
dir /B "%RELEASE_DIR%\*.md"
echo.

if %NO_GH%==1 (
    echo ⚠️  GitHub CLI nicht verfügbar - manuelle Schritte erforderlich:
    echo.
    echo 1. Git Tag erstellen:
    echo    git tag -a v1.6.0 -m "Release v1.6.0: Remote-Update-System + Persistente Einstellungen"
    echo    git push origin v1.6.0
    echo.
    echo 2. GitHub Release erstellen:
    echo    https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/new?tag=v1.6.0
    echo.
    echo 3. Folgende Dateien hochladen:
    echo    - %RELEASE_DIR%\Werkstatt-Terminplaner-Setup-1.6.0.exe
    echo    - %RELEASE_DIR%\Werkstatt-Intern-Setup-1.6.0-x64.exe
    echo    - %RELEASE_DIR%\Werkstatt-Intern-Setup-1.6.0-ia32.exe
    echo    - %RELEASE_DIR%\latest.yml
    echo.
    echo 4. Release Notes aus %RELEASE_DIR%\RELEASE-NOTES.md kopieren
    echo.
) else (
    echo [🏷️] Erstelle Git Tag...
    git tag -a v1.6.0 -m "Release v1.6.0: Remote-Update-System + Persistente Einstellungen"
    
    echo [⬆️] Push Tag zu GitHub...
    git push origin v1.6.0
    
    echo [🚀] Erstelle GitHub Release...
    gh release create v1.6.0 ^
        --title "v1.6.0 - Remote-Update-System + Persistente Einstellungen" ^
        --notes-file "%RELEASE_DIR%\RELEASE-NOTES.md" ^
        "%RELEASE_DIR%\Werkstatt-Terminplaner-Setup-1.6.0.exe" ^
        "%RELEASE_DIR%\Werkstatt-Intern-Setup-1.6.0-x64.exe" ^
        "%RELEASE_DIR%\Werkstatt-Intern-Setup-1.6.0-ia32.exe" ^
        "%RELEASE_DIR%\latest.yml"
    
    if %errorlevel% neq 0 (
        echo ❌ GitHub Release fehlgeschlagen!
        echo    Erstelle Release manuell auf GitHub.
    ) else (
        echo ✅ GitHub Release erfolgreich erstellt!
    )
)

echo.
echo ╔════════════════════════════════════════╗
echo ║  ✅ RELEASE KOMPLETT!                  ║
echo ╚════════════════════════════════════════╝
echo.
echo 📦 Release-Dateien: %RELEASE_DIR%
echo 🌐 GitHub: https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/tag/v1.6.0
echo.
echo 🎉 Version 1.6.0 ist bereit!
echo.

pause
