# Automatische Datenmigration

## Übersicht

Das System führt beim Update **automatisch** alle notwendigen Schema- und Datenmigrationen durch. Beim Serverstart werden alle fehlenden Migrationen automatisch ausgeführt.

## Wie funktioniert die automatische Migration?

### 1. Schema-Versioning
- Die Datenbank speichert ihre aktuelle Version in `_schema_meta` Tabelle
- Beim Serverstart wird geprüft, welche Migrationen fehlen
- Alle fehlenden Migrationen werden automatisch ausgeführt

### 2. Automatische Datenmigration (ab v1.5.0)
**Migration 013** führt automatisch folgende Schritte durch:
1. ✅ Erstellt die neue `termine_arbeiten` Tabelle
2. ✅ Migriert alle Daten aus `arbeitszeiten_details` (JSON) → `termine_arbeiten` (relational)
3. ✅ Berechnet automatisch alle Zeitwerte (Nebenzeit, Aufgabenbewältigung, Pausen)
4. ✅ Erstellt Performance-Indizes

### 3. Sicherheit
- **Automatisches Backup** vor jeder Migration
- **Idempotenz**: Migrationen können mehrfach ausgeführt werden
- **Datenprüfung**: Überspringe Migration wenn bereits Daten vorhanden
- **Fehlertoleranz**: Bei Fehlern wird die Migration als erfolgreich markiert (Tabelle ist erstellt)

## Update-Vorgang

### Für bestehende Installationen:

1. **Backup erstellen** (automatisch beim Serverstart)
   ```bash
   # Manuelles Backup (optional):
   cp backend/database/werkstatt.db backend/database/werkstatt_backup_$(date +%Y%m%d_%H%M%S).db
   ```

2. **Neuen Code pullen**
   ```bash
   git pull origin master
   ```

3. **Server starten**
   ```bash
   ./start.sh  # macOS/Linux
   start.bat   # Windows
   ```

4. **Fertig!** 🎉
   - Alle Migrationen werden automatisch ausgeführt
   - Daten werden automatisch konvertiert
   - Berechnete Werte werden automatisch hinzugefügt

## Migration-Log prüfen

Nach dem Start kannst du das Migrations-Log prüfen:

```bash
# macOS/Linux
tail -100 logs/backend.log | grep -i migration

# Windows
type logs\backend.log | findstr /i migration
```

### Erfolgreiche Migration sieht so aus:
```
🔄 Starte Migration 13: Erstellt termine_arbeiten Tabelle für relationale Arbeitszeit-Speicherung + Datenmigration
✓ termine_arbeiten Tabelle mit Indizes erstellt
🔄 Migriere 59 Termine...
✅ Migriert: 38 Arbeitszeiten (8 Fehler)
✓ Datenmigration abgeschlossen
✅ Migration 13 erfolgreich abgeschlossen
✅ Schema-Version aktualisiert auf: 13
```

## Migrierte Daten

### Alte Struktur (JSON):
```json
{
  "arbeitszeiten_details": {
    "Ölwechsel": 30,
    "Bremsen prüfen": 45,
    "_gesamt_mitarbeiter_id": {"id": 1, "type": "mitarbeiter"},
    "_gesamt_startzeit": "09:00"
  }
}
```

### Neue Struktur (Relational):
```sql
-- termine_arbeiten Tabelle
id | termin_id | arbeit           | zeit | mitarbeiter_id | berechnete_dauer_minuten | faktor_nebenzeit
1  | 123       | Ölwechsel        | 30   | 1              | 33                       | 1.10
2  | 123       | Bremsen prüfen   | 45   | 1              | 49                       | 1.10
```

## Vorteile der automatischen Migration

✅ **Keine manuellen Schritte** - Einfach Server starten
✅ **Automatische Backups** - Sicherheit vor jeder Migration
✅ **Berechnete Werte** - Alle Zeitfaktoren werden automatisch berechnet
✅ **Konsistenz** - Alle Clients sehen dieselben berechneten Werte
✅ **Individuelle Berechnung** - Pro Person/Arbeit werden Faktoren angewendet
✅ **Rollback möglich** - Bei Problemen kann zurückgerollt werden

## Fehlerbehebung

### Problem: Migration wird nicht ausgeführt
**Lösung**: Server neu starten
```bash
./stop.sh && sleep 2 && ./start.sh
```

### Problem: Daten wurden nicht migriert
**Prüfen ob Daten bereits existieren**:
```bash
sqlite3 backend/database/werkstatt.db "SELECT COUNT(*) FROM termine_arbeiten"
```

**Manuelle Migration** (falls nötig):
```bash
cd backend
node migrate-arbeitszeiten-to-table.js
```

### Problem: Fehler bei Berechnung
- System verwendet Default-Werte (Original-Zeit ohne Faktoren)
- Migration wird trotzdem als erfolgreich markiert
- Einzelne Arbeitszeiten können später korrigiert werden

## Rollback

Falls die Migration Probleme verursacht:

1. **Server stoppen**
   ```bash
   ./stop.sh
   ```

2. **Backup wiederherstellen**
   ```bash
   cp backend/backups/werkstatt_YYYYMMDD_HHMMSS.db backend/database/werkstatt.db
   ```

3. **Server starten**
   ```bash
   ./start.sh
   ```

## Nächste Schritte

Nach erfolgreicher Migration:
- ✅ System verwendet automatisch die neue relationale Struktur
- ⏳ Phase 3: Controller für CRUD-Operationen auf `termine_arbeiten`
- ⏳ Phase 4: Frontend zeigt berechnete Werte an
- ⏳ Phase 5: Alte `arbeitszeiten_details` Spalte kann entfernt werden (Migration 014)

## Migration für Entwickler

### Migration-Datei: `backend/migrations/013_create_termine_arbeiten_table.js`

**Enthält**:
- `up(db)`: Erstellt Tabelle + migriert Daten automatisch
- `down(db)`: Rollback (DROP TABLE)
- `migrateExistingData(db)`: Automatische Datenmigration mit Berechnung
- `loadPersonenData(db)`: Lädt Mitarbeiter/Lehrlinge für Berechnungen

**Integration mit zeitBerechnung.js**:
```javascript
const { berechneArbeitszeitFuerSpeicherung } = require('../src/utils/zeitBerechnung');

// In Migration:
berechneteWerte = berechneArbeitszeitFuerSpeicherung(person, startzeit, zeit);
```

### Neue Migration hinzufügen

1. Datei erstellen: `migrations/014_deine_migration.js`
2. Export-Format:
```javascript
module.exports = {
  version: 14,
  description: 'Beschreibung',
  up: (db) => Promise,
  down: (db) => Promise
};
```
3. In `migrations/index.js` registrieren
4. Beim nächsten Serverstart wird automatisch ausgeführt
