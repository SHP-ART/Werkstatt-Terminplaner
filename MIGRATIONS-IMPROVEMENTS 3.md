# Datenbank-Migrations-Verbesserungen

## Übersicht

Umfassende Verbesserungen des Migrations-Systems für mehr Robustheit, Sicherheit und Benutzerfreundlichkeit.

## Implementierte Features

### 1. ✅ Version-19-Konflikt behoben
- **Problem**: Zwei Migrationen mit Version 19 (`019_add_pause_tracking_and_verschoben` und `019_tablet_einstellungen`)
- **Lösung**: `019_tablet_einstellungen.js` → `020_tablet_einstellungen.js` umbenannt
- **Dateien**: 
  - `backend/migrations/020_tablet_einstellungen.js` (neu benannt)
  - `backend/migrations/index.js` (aktualisiert)

### 2. ✅ Transaktions-Sicherheit
- **Feature**: Alle Migrationen laufen jetzt in `BEGIN TRANSACTION...COMMIT/ROLLBACK`
- **Vorteil**: Bei Fehler wird automatisch zurückgerollt → keine halbfertigen Datenbankzustände
- **Implementierung**: `backend/migrations/index.js` - `runMigration()` mit Transaktions-Wrapper

### 3. ✅ Pre-Migration-Checks
- **Checks**:
  - Freier Speicherplatz (mindestens 1 GB oder 3x DB-Größe)
  - Gültiges Backup vorhanden
  - Datenbank nicht im Read-Only-Modus
  - Schreibzugriff-Test
- **Implementierung**: `backend/src/config/database.js` - `validateMigrationPreConditions()`
- **Verhalten**: Blockiert Migration bei kritischen Fehlern

### 4. ✅ Migrations-Locking
- **Feature**: Verhindert parallele Migrations-Ausführung
- **Mechanismus**: 
  - `_migration_lock` Tabelle mit `process_id`, `hostname`, `locked_at`
  - Stale-Lock-Detection (> 30 Minuten alte Locks werden automatisch freigegeben)
- **Implementierung**: `backend/src/config/database.js` - `migrationLock` Objekt

### 5. ✅ Schema-Checksummen
- **Feature**: SHA256-Hash der Datenbankstruktur
- **Zweck**: Erkennt manuelle Schema-Änderungen außerhalb des Migrations-Systems
- **Speicherung**: `_schema_meta` Tabelle, Spalte `schema_checksum`
- **Implementierung**: `backend/src/config/database.js` - `calculateSchemaChecksum()`, `verifySchemaIntegrity()`

### 6. ✅ Progress-Tracking mit WebSocket
- **Feature**: Echtzeit-Fortschritts-Updates während Migrationen
- **Events**:
  - `migration_progress` - Fortschritt einzelner Migration
  - `operation_progress` - Fortschritt mit Timeout-Info
  - `operation_timeout_warning` - Warnung bei 80% Timeout
  - `migration_failed` - Fehler-Event
  - `migrations_completed` - Erfolg-Event
- **Implementierung**: `backend/migrations/index.js` - `broadcastMigrationProgress()`

### 7. ✅ Timeout-Handling
- **Feature**: Automatischer Timeout mit konfigurierbarem Limit (Standard: 5 Minuten)
- **AsyncOperation-Klasse**:
  - Timeout-Timer mit Warning bei 80%
  - Automatischer Rollback bei Timeout
  - Progress-Tracking
  - WebSocket-Broadcasting
- **Implementierung**: `backend/src/utils/asyncOperations.js`

### 8. ✅ Migrations-Status-API
- **Neue Endpoints**:
  - `GET /api/system/migration-status` - Aktueller Status
  - `POST /api/system/migration/dry-run` - Test-Migration
  - `GET /api/system/migrations/all` - Alle Migrationen auflisten
  - `GET /api/system/schema-info` - Schema-Informationen
- **Implementierung**: 
  - `backend/src/controllers/systemController.js`
  - `backend/src/routes/systemRoutes.js`

### 9. ✅ Dry-Run-Modus
- **Feature**: Migrationen testen ohne permanente Änderungen
- **Mechanismus**: Führt Migration in Transaktion aus, aber `ROLLBACK` statt `COMMIT`
- **API**: `POST /api/system/migration/dry-run`
- **Verwendung**: 
  ```javascript
  await runMigrations(db, currentVersion, { dryRun: true });
  ```

### 10. ✅ Frontend Migration-Progress-Modal
- **UI-Komponente**: Modal mit Progress-Bar und Status-Text
- **Features**:
  - Echtzeit-Updates via WebSocket
  - Timeout-Countdown (mit Farbcodierung)
  - Spinner-Animation
  - Auto-Hide nach Erfolg/Fehler
- **Implementierung**: `frontend/src/components/migrationMonitor.js`
- **Integration**: Automatisch in `frontend/index.html` geladen

### 11. ✅ Structured Logging
- **Log-Datei**: `logs/migrations.log`
- **Format**: `[ISO-Timestamp] [Version X] [STATUS] [Duration: Xms] Description`
- **Status-Codes**: `STARTED`, `COMPLETED`, `FAILED`, `ROLLED_BACK`, `DRY_RUN_OK`
- **Details**: Bei Fehler inkl. Error-Message und Stack-Trace
- **Implementierung**: `backend/migrations/index.js` - `logMigration()`

### 12. ✅ Migrations-Tests
- **Test-Suite**: `backend/tests/migrations.test.js`
- **Abdeckung**:
  - Transaktions-Rollback bei Fehler
  - Idempotente Mehrfach-Ausführung
  - Lock-Handling mit Concurrent-Access
  - Stale-Lock-Detection
  - Pre-Migration-Checks
  - Dry-Run-Modus
  - Schema-Checksum-Konsistenz
  - Timeout-Handling
- **Framework**: Jest (empfohlen)
- **Ausführung**: `npm test backend/tests/migrations.test.js`

## Verwendung

### Server-Start
```bash
./start.sh
```
Migrationen laufen automatisch mit allen neuen Features:
1. Pre-Checks (Speicher, Backup, Schreibzugriff)
2. Lock-Erwerb
3. Backup-Erstellung
4. Migrations-Ausführung mit Transaktionen
5. Progress-Broadcasting via WebSocket
6. Schema-Checksum-Update
7. Lock-Freigabe

### Dry-Run über API
```bash
curl -X POST http://localhost:3001/api/system/migration/dry-run
```

### Migrations-Status prüfen
```bash
curl http://localhost:3001/api/system/migration-status
```

Beispiel-Response:
```json
{
  "status": "ok",
  "schema": {
    "currentVersion": 20,
    "latestVersion": 20,
    "isUpToDate": true,
    "checksum": "a3f5b21c9d8e7...",
    "integrityOk": true
  },
  "migrations": {
    "total": 20,
    "pending": 0,
    "pendingList": []
  },
  "lock": {
    "locked": false,
    "lockedBy": null,
    "lockedAt": null
  }
}
```

## Fehlerbehandlung

### Migrations-Fehler
- **Automatischer Rollback**: Bei Fehler in Migration wird Transaktion zurückgerollt
- **Lock-Freigabe**: Lock wird automatisch freigegeben
- **Logging**: Fehler wird in `logs/migrations.log` geschrieben
- **WebSocket**: `migration_failed` Event an Frontend
- **UI**: Toast-Fehler-Benachrichtigung + Modal-Anzeige

### Timeout-Fehler
- **Warning bei 80%**: WebSocket-Event `operation_timeout_warning`
- **Automatischer Rollback**: Bei 100% Timeout wird Transaktion abgebrochen
- **UI**: Countdown im Modal, Farbcodierung (Grün → Orange → Rot)

### Pre-Check-Fehler
- **Blockierung**: Migration startet nicht
- **Logging**: Details in `logs/server-debug.log`
- **Lösung**: Speicher freimachen, Backup prüfen, Berechtigungen prüfen

## Konfiguration

### Timeout pro Migration
In Migration-Datei:
```javascript
module.exports = {
  version: 21,
  description: 'Meine Migration',
  timeout: 600000, // 10 Minuten (Standard: 5 Min.)
  
  async up(db) {
    // Migration-Code
  }
};
```

### Globaler Timeout
In `backend/migrations/index.js`:
```javascript
await runMigrations(db, currentVersion, { 
  dryRun: false, 
  timeout: 300000 // 5 Minuten
});
```

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│                    Server-Start                         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  initializeDatabaseWithBackup()                         │
│  - Warte auf DB-Connection                              │
│  - Lade Schema-Version                                  │
│  - Verifiziere Schema-Integrität                        │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
        ┌──────────────────┐
        │ Migrationen nötig?│
        └────┬───────────┬──┘
             │ Ja        │ Nein → Ende
             ▼           │
┌─────────────────────────┴───────────────────────────────┐
│  Pre-Migration-Checks                                   │
│  - Speicherplatz (> 1GB)                                │
│  - Backup vorhanden                                     │
│  - Schreibzugriff                                       │
└──────────────────┬──────────────────────────────────────┘
                   │ Checks OK
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Migration-Lock erwerben                                │
│  - Prüfe _migration_lock Tabelle                        │
│  - Stale-Lock-Detection (> 30 Min)                      │
│  - Insert Lock-Eintrag                                  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Backup erstellen                                       │
│  - backup/werkstatt_backup_TIMESTAMP.db                 │
│  - Alte Backups aufräumen (max 10)                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Für jede ausstehende Migration:                        │
│                                                          │
│  1. AsyncOperation erstellen (mit Timeout)              │
│  2. BEGIN TRANSACTION                                   │
│  3. migration.up(db) ausführen                          │
│  4. Progress-Broadcasting                               │
│  5. COMMIT (oder ROLLBACK bei Fehler/Timeout)           │
│  6. Log schreiben (migrations.log)                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Post-Migration                                         │
│  - Schema-Version aktualisieren                         │
│  - Schema-Checksum berechnen & speichern                │
│  - Migration-Lock freigeben                             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
               ✅ Fertig
```

## Dateien-Übersicht

### Backend - Core
- `backend/migrations/index.js` - Migration-Runner mit Transaktionen
- `backend/migrations/020_tablet_einstellungen.js` - Umbenannte Migration
- `backend/src/config/database.js` - Pre-Checks, Locking, Checksummen

### Backend - Utilities
- `backend/src/utils/asyncOperations.js` - Timeout-Handling
- `backend/src/controllers/systemController.js` - API-Controller
- `backend/src/routes/systemRoutes.js` - API-Routes

### Frontend
- `frontend/src/components/migrationMonitor.js` - Progress-Modal
- `frontend/index.html` - Script-Integration

### Tests & Logs
- `backend/tests/migrations.test.js` - Test-Suite
- `logs/migrations.log` - Structured Logging

## Nächste Schritte

1. **Tests ausführen**: `npm test backend/tests/migrations.test.js`
2. **Server starten**: `./start.sh` (prüft neue Migrations-Features)
3. **API testen**: 
   ```bash
   curl http://localhost:3001/api/system/migration-status
   ```
4. **Dry-Run testen** (wenn neue Migrationen vorhanden):
   ```bash
   curl -X POST http://localhost:3001/api/system/migration/dry-run
   ```

## Bekannte Einschränkungen

1. **SQLite-Limitierungen**: 
   - Kein `ALTER TABLE DROP COLUMN`
   - Kein `ALTER TABLE MODIFY COLUMN`
   - Workaround: Tabelle neu erstellen + Daten kopieren

2. **Transaktions-DDL**:
   - SQLite unterstützt DDL in Transaktionen
   - Andere DBs (z.B. MySQL MyISAM) nicht → bei DB-Wechsel anpassen

3. **Concurrent-Access**:
   - Lock verhindert parallele Server-Starts
   - Bei Cluster-Deployment: zentraler Lock-Service nötig

## Changelog

### Version 1.5.1 (2026-02-04)
- ✅ Version-19-Konflikt behoben
- ✅ Transaktions-Sicherheit implementiert
- ✅ Pre-Migration-Checks hinzugefügt
- ✅ Migrations-Locking implementiert
- ✅ Schema-Checksummen eingeführt
- ✅ Progress-Tracking mit WebSocket
- ✅ Timeout-Handling mit AsyncOperation
- ✅ Migrations-Status-API erstellt
- ✅ Dry-Run-Modus implementiert
- ✅ Frontend Progress-Modal hinzugefügt
- ✅ Structured Logging verbessert
- ✅ Umfassende Test-Suite erstellt
