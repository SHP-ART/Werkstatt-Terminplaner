@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo ============================================
echo   Werkstatt-Terminplaner Datenbank-Reparatur
echo ============================================
echo.

:: SQLite herunterladen falls nicht vorhanden
set "SQLITE_EXE=%~dp0sqlite3.exe"
if not exist "%SQLITE_EXE%" (
    echo SQLite wird heruntergeladen...
    powershell -Command "Invoke-WebRequest -Uri 'https://www.sqlite.org/2024/sqlite-tools-win-x64-3470200.zip' -OutFile '%TEMP%\sqlite.zip'"
    powershell -Command "Expand-Archive -Path '%TEMP%\sqlite.zip' -DestinationPath '%TEMP%\sqlite' -Force"
    copy "%TEMP%\sqlite\sqlite-tools-win-x64-3470200\sqlite3.exe" "%SQLITE_EXE%" >nul
    del "%TEMP%\sqlite.zip" 2>nul
    rmdir /s /q "%TEMP%\sqlite" 2>nul
    echo SQLite heruntergeladen.
    echo.
)

:: Datenbank suchen
echo Suche Datenbank...
set "DB_PATH="

:: Mögliche Pfade prüfen
for /d %%D in ("%LOCALAPPDATA%\Temp\*") do (
    if exist "%%D\asar-app-0\database\werkstatt.db" (
        set "DB_PATH=%%D\asar-app-0\database\werkstatt.db"
    )
    if exist "%%D\database\werkstatt.db" (
        set "DB_PATH=%%D\database\werkstatt.db"
    )
)

:: AppData Roaming prüfen
if exist "%APPDATA%\Werkstatt Terminplaner\database\werkstatt.db" (
    set "DB_PATH=%APPDATA%\Werkstatt Terminplaner\database\werkstatt.db"
)

:: Lokales backend prüfen
if exist "%~dp0backend\database\werkstatt.db" (
    set "DB_PATH=%~dp0backend\database\werkstatt.db"
)

:: Im gleichen Ordner (für installierte Version)
if exist "%~dp0database\werkstatt.db" (
    set "DB_PATH=%~dp0database\werkstatt.db"
)

:: resources Ordner (Electron App)
if exist "%~dp0..\database\werkstatt.db" (
    set "DB_PATH=%~dp0..\database\werkstatt.db"
)

if "%DB_PATH%"=="" (
    echo.
    echo FEHLER: Keine Datenbank gefunden!
    echo.
    echo Bitte gib den Pfad zur werkstatt.db manuell ein:
    set /p "DB_PATH=Pfad: "
)

if not exist "%DB_PATH%" (
    echo.
    echo FEHLER: Datenbank nicht gefunden: %DB_PATH%
    echo.
    pause
    exit /b 1
)

echo Datenbank gefunden: %DB_PATH%
echo.

:: Backup erstellen
echo Erstelle Backup...
set "BACKUP_PATH=%DB_PATH%.backup_%date:~-4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%.db"
set "BACKUP_PATH=%BACKUP_PATH: =0%"
copy "%DB_PATH%" "%BACKUP_PATH%" >nul
echo Backup erstellt: %BACKUP_PATH%
echo.

:: SQL-Befehle in temporäre Datei schreiben
set "SQL_FILE=%TEMP%\migrate_db.sql"
(
echo -- Termine-Tabelle Spalten
echo ALTER TABLE termine ADD COLUMN startzeit TEXT;
echo ALTER TABLE termine ADD COLUMN endzeit_berechnet TEXT;
echo ALTER TABLE termine ADD COLUMN kunde_name TEXT;
echo ALTER TABLE termine ADD COLUMN kunde_telefon TEXT;
echo ALTER TABLE termine ADD COLUMN abholung_typ TEXT DEFAULT 'abholung';
echo ALTER TABLE termine ADD COLUMN abholung_details TEXT;
echo ALTER TABLE termine ADD COLUMN abholung_zeit TEXT;
echo ALTER TABLE termine ADD COLUMN bring_zeit TEXT;
echo ALTER TABLE termine ADD COLUMN kontakt_option TEXT;
echo ALTER TABLE termine ADD COLUMN kilometerstand INTEGER;
echo ALTER TABLE termine ADD COLUMN ersatzauto INTEGER DEFAULT 0;
echo ALTER TABLE termine ADD COLUMN ersatzauto_tage INTEGER;
echo ALTER TABLE termine ADD COLUMN ersatzauto_bis_datum DATE;
echo ALTER TABLE termine ADD COLUMN ersatzauto_bis_zeit TEXT;
echo ALTER TABLE termine ADD COLUMN abholung_datum DATE;
echo ALTER TABLE termine ADD COLUMN termin_nr TEXT;
echo ALTER TABLE termine ADD COLUMN arbeitszeiten_details TEXT;
echo ALTER TABLE termine ADD COLUMN mitarbeiter_id INTEGER;
echo ALTER TABLE termine ADD COLUMN geloescht_am DATETIME;
echo ALTER TABLE termine ADD COLUMN dringlichkeit TEXT;
echo ALTER TABLE termine ADD COLUMN vin TEXT;
echo ALTER TABLE termine ADD COLUMN fahrzeugtyp TEXT;
echo ALTER TABLE termine ADD COLUMN ist_schwebend INTEGER DEFAULT 0;
echo ALTER TABLE termine ADD COLUMN parent_termin_id INTEGER;
echo ALTER TABLE termine ADD COLUMN split_teil INTEGER;
echo ALTER TABLE termine ADD COLUMN muss_bearbeitet_werden INTEGER DEFAULT 0;
echo ALTER TABLE termine ADD COLUMN erweiterung_von_id INTEGER;
echo ALTER TABLE termine ADD COLUMN ist_erweiterung INTEGER DEFAULT 0;
echo ALTER TABLE termine ADD COLUMN erweiterung_typ TEXT;
echo ALTER TABLE termine ADD COLUMN teile_status TEXT DEFAULT 'vorraetig';
echo ALTER TABLE termine ADD COLUMN interne_auftragsnummer TEXT;
echo.
echo -- Kunden-Tabelle Spalten
echo ALTER TABLE kunden ADD COLUMN vin TEXT;
echo ALTER TABLE kunden ADD COLUMN fahrzeugtyp TEXT;
echo.
echo -- Mitarbeiter-Tabelle Spalten
echo ALTER TABLE mitarbeiter ADD COLUMN nebenzeit_prozent REAL DEFAULT 0;
echo ALTER TABLE mitarbeiter ADD COLUMN ist_lehrling INTEGER DEFAULT 0;
echo ALTER TABLE mitarbeiter ADD COLUMN lehrjahr INTEGER;
echo ALTER TABLE mitarbeiter ADD COLUMN mittagspause_start TEXT;
echo ALTER TABLE mitarbeiter ADD COLUMN mittagspause_dauer INTEGER DEFAULT 30;
echo ALTER TABLE mitarbeiter ADD COLUMN reihenfolge INTEGER DEFAULT 0;
) > "%SQL_FILE%"

echo Migration wird ausgefuehrt...
echo.

:: SQLite ausführen (Fehler bei bereits existierenden Spalten ignorieren)
"%SQLITE_EXE%" "%DB_PATH%" < "%SQL_FILE%" 2>&1 | findstr /v "duplicate column"

del "%SQL_FILE%" 2>nul

echo.
echo ============================================
echo   Migration abgeschlossen!
echo ============================================
echo.
echo Bitte starte die Werkstatt-Terminplaner App neu.
echo.
pause
