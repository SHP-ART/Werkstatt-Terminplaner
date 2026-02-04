# Verbessertes Backup-System v1.5.5+

## 🎯 Problem gelöst

**Original-Problem:** Nach Restore eines Backups vom Produktiv-System waren keine aktuellen Termine sichtbar, obwohl die Migration funktionierte.

**Ursache:** Die Backups waren vom Produktiv-System, aber die Daten darin waren veraltet (1 Monat alt). Das Entwicklungssystem hat keine aktuellen Produktiv-Daten.

## ✨ Neue Features

### 1. Automatisches Backup beim Server-Start

Der Server erstellt beim Start **automatisch ein Backup** der aktuellen Datenbank:

```
💾 Auto-Backup erstellt beim Server-Start: werkstatt_backup_AUTO_2026-02-04T08-52-33.db
```

- **Einmal pro Tag**: Wenn bereits ein Backup von heute existiert, wird übersprungen
- **Automatisch**: Kein manueller Eingriff nötig
- **Sicher**: Backup wird vor allen Änderungen erstellt

### 2. Datenbank-Aktualitäts-Prüfung

Das System prüft automatisch, ob die Datenbank **aktuelle Termine** enthält:

```javascript
Prüfkriterien:
- Neuester Termin älter als 7 Tage? → Warnung
- Keine Termine in letzten 7 Tagen? → Warnung
- Gesamtanzahl Termine
```

**Beispiel-Warnung beim Server-Start:**

```
⚠️  WARNUNG: Die Datenbank enthält keine aktuellen Termine!
   Neuester Termin: 2026-01-17 (vor 18 Tagen)
   Total Termine: 407
   → Möglicherweise verwenden Sie eine Test-/Entwicklungs-DB
```

### 3. Erweiterte Backup-API

Die Backup-Endpunkte geben nun **zusätzliche Informationen** zurück:

#### `POST /api/backup/create`

**Neue Response:**
```json
{
  "message": "Backup erstellt",
  "backup": {
    "name": "werkstatt_backup_2026-02-04T09-30-00.db",
    "sizeBytes": 466944,
    "createdAt": "2026-02-04T09:30:00.000Z"
  },
  "datenStatus": {
    "totalTermine": 407,
    "neusterTermin": "2026-01-17",
    "termineLetzteSiebenTage": 0
  },
  "warnung": "⚠️ Die Datenbank enthält keine aktuellen Termine..."
}
```

#### `GET /api/backup/status`

**Erweiterte Response:**
```json
{
  "dbPath": "...",
  "backupDir": "...",
  "dbSizeBytes": 466944,
  "lastBackup": {...},
  "backupCount": 5,
  "datenStatus": {
    "totalTermine": 407,
    "neusterTermin": "2026-01-17",
    "aeltesterTermin": "2025-12-31",
    "termineLetzteSiebenTage": 0,
    "alterInTagen": 18,
    "istVeraltet": true
  },
  "warnung": "⚠️ Die Datenbank enthält keine aktuellen Termine..."
}
```

## 🔧 Technische Details

### Neue Funktionen in `backupController.js`

#### 1. `checkDatabaseCurrency(callback)`
Prüft die Aktualität der Datenbank-Daten:
- Zählt Termine der letzten 7 Tage
- Berechnet Alter des neuesten Termins
- Markiert DB als "veraltet" wenn >7 Tage

#### 2. `createAutoBackupOnStartup()`
Erstellt automatisches Backup beim Server-Start:
- Prüft ob heute bereits ein Backup existiert
- Erstellt Backup mit Prefix `AUTO_`
- Zeigt Warnung bei veralteten Daten
- Promise-basiert für async/await

### Integration in `server.js`

Nach der Datenbank-Initialisierung:
```javascript
// Automatisches Backup beim Start erstellen
const BackupController = require('./controllers/backupController');
const autoBackupResult = await BackupController.createAutoBackupOnStartup();

if (autoBackupResult.warnung) {
    console.warn(autoBackupResult.warnung);
}
```

## 📋 Verwendung

### Als Administrator

1. **Server starten** → Automatisches Backup wird erstellt
2. **Warnung beachten** wenn Daten veraltet sind
3. **Backup-Status prüfen** über Frontend oder API

### Für Produktiv-System

1. **Regelmäßig Backups erstellen** (täglich empfohlen)
2. **Backups auf sicheren Speicher kopieren** (nicht nur lokal!)
3. **Beim Restore beachten**: Automatische Schema-Migration läuft

### Backup vom Produktiv-System übertragen

```powershell
# 1. Auf Produktiv-System: Backup erstellen
# → Via Frontend: Einstellungen → Backup erstellen

# 2. Backup-Datei kopieren nach Entwicklungs-System
Copy-Item "\\PRODUKTIV-SERVER\Backups\werkstatt_backup_DATUM.db" `
          "C:\...\backend\database\backups\"

# 3. Auf Entwicklungs-System: Backup wiederherstellen
# → Via Frontend: Einstellungen → Backup auswählen → Wiederherstellen
# → API: POST /api/backup/restore { "filename": "werkstatt_backup_DATUM.db" }

# 4. Browser neu laden
```

## ⚠️ Wichtige Hinweise

### Entwicklungs- vs. Produktiv-System

**Problem:** Sie arbeiten auf einem **Entwicklungs-Rechner** mit einer Test-DB.

**Lösung:**
- Regelmäßig **aktuelles Backup vom Produktiv-System** holen
- Über das Frontend **wiederherstellen**
- Oder: Auf dem Produktiv-System arbeiten (empfohlen!)

### Warnung bei veralteten Daten

Die Warnung bedeutet **NICHT**, dass etwas kaputt ist!

Sie bedeutet:
- ✅ System funktioniert korrekt
- ✅ Migration funktioniert
- ⚠️ Aber: Die Daten sind alt (Entwicklungs-DB)

### Automatische Backups

- **Einmal pro Tag**: Ein Auto-Backup reicht
- **Manuell**: Sie können jederzeit zusätzliche Backups erstellen
- **Namensformat**: `werkstatt_backup_AUTO_YYYY-MM-DDTHH-MM-SS.db`

## 🧪 Testen

### Test 1: Auto-Backup beim Start

```bash
npm start
```

**Erwartetes Ergebnis:**
```
💾 Auto-Backup erstellt beim Server-Start: werkstatt_backup_AUTO_2026-02-04...
```

Oder:
```
✅ Auto-Backup: Backup von heute existiert bereits: ...
```

### Test 2: Backup-Status prüfen

```bash
curl http://localhost:3001/api/backup/status
```

**Erwartetes Ergebnis:**
```json
{
  "datenStatus": {
    "totalTermine": 407,
    "neusterTermin": "2026-01-17",
    ...
  },
  "warnung": "..." // falls Daten veraltet
}
```

### Test 3: Manuelles Backup erstellen

```bash
curl -X POST http://localhost:3001/api/backup/create
```

**Erwartetes Ergebnis:**
```json
{
  "message": "Backup erstellt",
  "backup": {...},
  "datenStatus": {...},
  "warnung": "..." // falls Daten veraltet
}
```

## 📚 Weitere Dokumentationen

- [BACKUP-RESTORE-FIX.md](./BACKUP-RESTORE-FIX.md) - Schema-Migrations-Fix
- [MIGRATIONS.md](./MIGRATIONS.md) - Datenbank-Migrationen
- [README.md](./README.md) - Allgemeine Dokumentation

## 🔄 Änderungen

### v1.5.5+

- ✅ Automatisches Backup beim Server-Start
- ✅ Datenbank-Aktualitäts-Prüfung
- ✅ Erweiterte Backup-API mit Status-Informationen
- ✅ Warnungen bei veralteten Daten
- ✅ Detailliertes Logging

### Modifizierte Dateien

1. **backend/src/controllers/backupController.js**
   - Neue Funktion: `checkDatabaseCurrency()`
   - Neue Funktion: `createAutoBackupOnStartup()`
   - Erweitert: `create()` mit Daten-Prüfung
   - Erweitert: `status()` mit Daten-Prüfung

2. **backend/src/server.js**
   - Integration: Auto-Backup nach DB-Initialisierung
   - Logging: Warnungen bei veralteten Daten

## 🎉 Fazit

Das verbesserte Backup-System:
- ✅ Schützt vor Datenverlust (automatische Backups)
- ✅ Warnt bei veralteten Daten (Entwicklungs-DB-Problem)
- ✅ Gibt detaillierte Status-Informationen
- ✅ Funktioniert nahtlos mit Schema-Migration

**Empfehlung:** Arbeiten Sie direkt auf dem Produktiv-System oder holen Sie täglich aktuelle Backups!
