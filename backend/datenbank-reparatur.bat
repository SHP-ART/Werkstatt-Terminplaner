@echo off
setlocal EnableDelayedExpansion

echo ============================================
echo   Werkstatt-Terminplaner Datenbank-Reparatur
echo ============================================
echo.

REM SQLite herunterladen falls nicht vorhanden
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

REM Datenbank suchen
echo Suche Datenbank...
set "DB_PATH="

REM Temp Ordner pruefen
for /d %%D in ("%LOCALAPPDATA%\Temp\*") do (
    if exist "%%D\asar-app-0\database\werkstatt.db" (
        set "DB_PATH=%%D\asar-app-0\database\werkstatt.db"
    )
    if exist "%%D\database\werkstatt.db" (
        set "DB_PATH=%%D\database\werkstatt.db"
    )
)

REM AppData Roaming pruefen
if exist "%APPDATA%\Werkstatt Terminplaner\database\werkstatt.db" (
    set "DB_PATH=%APPDATA%\Werkstatt Terminplaner\database\werkstatt.db"
)

REM Lokales backend pruefen
if exist "%~dp0backend\database\werkstatt.db" (
    set "DB_PATH=%~dp0backend\database\werkstatt.db"
)

REM Im gleichen Ordner
if exist "%~dp0database\werkstatt.db" (
    set "DB_PATH=%~dp0database\werkstatt.db"
)

REM resources Ordner (Electron App)
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

REM Backup erstellen
echo Erstelle Backup...
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set "BACKUP_PATH=%DB_PATH%.backup_%datetime:~0,8%_%datetime:~8,4%.db"
copy "%DB_PATH%" "%BACKUP_PATH%" >nul
echo Backup erstellt: %BACKUP_PATH%
echo.

REM SQL-Befehle in temporaere Datei schreiben
set "SQL_FILE=%TEMP%\migrate_db.sql"

echo -- Termine-Tabelle Spalten > "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN startzeit TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN endzeit_berechnet TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN kunde_name TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN kunde_telefon TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN abholung_typ TEXT DEFAULT 'abholung'; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN abholung_details TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN abholung_zeit TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN bring_zeit TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN kontakt_option TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN kilometerstand INTEGER; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN ersatzauto INTEGER DEFAULT 0; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN ersatzauto_tage INTEGER; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN ersatzauto_bis_datum DATE; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN ersatzauto_bis_zeit TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN abholung_datum DATE; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN termin_nr TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN arbeitszeiten_details TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN mitarbeiter_id INTEGER; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN geloescht_am DATETIME; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN dringlichkeit TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN vin TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN fahrzeugtyp TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN ist_schwebend INTEGER DEFAULT 0; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN parent_termin_id INTEGER; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN split_teil INTEGER; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN muss_bearbeitet_werden INTEGER DEFAULT 0; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN erweiterung_von_id INTEGER; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN ist_erweiterung INTEGER DEFAULT 0; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN erweiterung_typ TEXT; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN teile_status TEXT DEFAULT 'vorraetig'; >> "%SQL_FILE%"
echo ALTER TABLE termine ADD COLUMN interne_auftragsnummer TEXT; >> "%SQL_FILE%"
echo -- Kunden-Tabelle Spalten >> "%SQL_FILE%"
echo ALTER TABLE kunden ADD COLUMN vin TEXT; >> "%SQL_FILE%"
echo ALTER TABLE kunden ADD COLUMN fahrzeugtyp TEXT; >> "%SQL_FILE%"
echo -- Mitarbeiter-Tabelle Spalten >> "%SQL_FILE%"
echo ALTER TABLE mitarbeiter ADD COLUMN nebenzeit_prozent REAL DEFAULT 0; >> "%SQL_FILE%"
echo ALTER TABLE mitarbeiter ADD COLUMN ist_lehrling INTEGER DEFAULT 0; >> "%SQL_FILE%"
echo ALTER TABLE mitarbeiter ADD COLUMN lehrjahr INTEGER; >> "%SQL_FILE%"
echo ALTER TABLE mitarbeiter ADD COLUMN mittagspause_start TEXT; >> "%SQL_FILE%"
echo ALTER TABLE mitarbeiter ADD COLUMN mittagspause_dauer INTEGER DEFAULT 30; >> "%SQL_FILE%"
echo ALTER TABLE mitarbeiter ADD COLUMN reihenfolge INTEGER DEFAULT 0; >> "%SQL_FILE%"

echo Migration wird ausgefuehrt...
echo.

REM SQLite ausfuehren
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
