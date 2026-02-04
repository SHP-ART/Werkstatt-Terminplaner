# Bug-Fix: Termine verschwinden nach Backup-Restore

## Problem
Trotz Einspielen einer Backup-Datenbank waren alle Termine weg. Fahrzeuge und Mitarbeiter blieben erhalten.

## Ursache
Die **alte Backup-Datenbank** verwendete das **alte Schema-System** (`_schema_meta` mit Version 2-11), während die **neue Version** das **neue System** (`schema_migrations` mit Version 1-20) verwendet.

Beim Backup-Restore wurde:
1. Die alte Datenbankstruktur wiederhergestellt
2. Das neue Migrations-System erkannte die alte DB nicht
3. Neue Migrationen (019, 020) wurden nicht angewendet
4. Das Frontend suchte nach neuen Spalten, die nicht existierten

**Die Termine waren NICHT weg** - sie waren einfach nicht sichtbar, weil das Schema inkompatibel war!

## Lösung implementiert

### 1. Automatische Schema-Kompatibilität
Datei: `backend/src/config/schemaCompatibility.js`

- **Erkennt automatisch** alte `_schema_meta` Datenbanken
- **Konvertiert automatisch** beim Server-Start
- **Erstellt** `schema_migrations` Tabelle
- **Überträgt** Migrations-Historie (Version 1-11 → 1-20)
- **Ergänzt** fehlende Strukturen (pause_tracking, tablet_einstellungen, verschoben_von_datum)

### 2. Integration in database.js
Die Funktion `ensureSchemaCompatibility()` wird **automatisch** beim Server-Start ausgeführt, **BEVOR** Migrationen laufen:

```javascript
// 0.5 WICHTIG: Schema-Kompatibilität prüfen
const compatResult = await ensureSchemaCompatibility(dbWrapper.connection);
if (compatResult.converted) {
  console.log(`✅ ${compatResult.message}`);
}
```

### 3. Manueller Fix (falls nötig)
Falls du ein altes Backup wiederherstellen musst:

```bash
cd backend
node fix-migration-compatibility.js
```

Dieses Script:
- ✅ Erstellt automatisch ein Backup
- ✅ Konvertiert die Datenbank
- ✅ Behält alle Termine bei
- ✅ Macht die DB kompatibel mit v1.5.5

## Testen

### Altes Backup wiederherstellen
```bash
cd backend
Copy-Item "backups\alte-db.db" "database\werkstatt.db" -Force
```

### Server starten (konvertiert automatisch)
```bash
cd backend
npm start
```

Du siehst dann:
```
╔═══════════════════════════════════════════════════════════════╗
║  🔄 ALTE DATENBANK ERKANNT - AUTOMATISCHE KONVERTIERUNG      ║
╚═══════════════════════════════════════════════════════════════╝

📊 Alte Schema-Version: X
✓ Tabelle schema_migrations erstellt
📝 Übertrage Migrations-Historie...
  ✓ Migration 1-18 eingetragen
🔧 Prüfe fehlende Strukturen...
  ✓ Spalte verschoben_von_datum hinzugefügt
  ✓ Tabelle pause_tracking erstellt
  ✓ Tabelle tablet_einstellungen erstellt

╔═══════════════════════════════════════════════════════════════╗
║  ✅ KONVERTIERUNG ERFOLGREICH - Schema-Version: 20         ║
╚═══════════════════════════════════════════════════════════════╝
```

### Prüfen ob Termine da sind
```bash
cd backend
node check-termine-bug.js
```

Zeigt:
- ✓ Anzahl Termine: XXX
- ✓ Schema-Version: 20
- ✓ Neue Tabellen vorhanden

## Backup-Empfehlung

Ab sofort werden alle Backups automatisch kompatibel sein, da:
1. Neue Backups enthalten bereits `schema_migrations`
2. Beim Restore wird automatisch konvertiert
3. Termine gehen nie verloren

**Wichtig:** Backups sollten regelmäßig erstellt werden:
- Automatisch vor Migrationen
- Manuell über Frontend (Einstellungen → Backup)
- Behalte die letzten 10 Backups

## Dateien

- `backend/src/config/schemaCompatibility.js` - Automatische Konvertierung
- `backend/src/config/database.js` - Integration beim Start
- `backend/fix-migration-compatibility.js` - Manueller Fix
- `backend/check-termine-bug.js` - Diagnose-Tool
- `backend/diagnose-schema.js` - Schema-Analyse

## Version
- Implementiert: v1.5.5
- Datum: 4. Februar 2026
- Status: ✅ Getestet und funktioniert
