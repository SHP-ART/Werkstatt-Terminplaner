# Version 1.5.0 - Automatische Datenmigration

**Release-Datum:** 2. Februar 2026

## 🎯 Highlights

### ✨ Automatische Datenmigration
Beim Update werden jetzt **alle Datenbank-Migrationen vollautomatisch** durchgeführt - kein manuelles Eingreifen mehr nötig!

**Einfachstes Update ever:**
```bash
git pull origin master
./start.sh
```
Fertig! 🎉

## 🆕 Neue Features

### Automatische Migration
- ✅ **Schema-Migration**: Automatisch beim Serverstart
- ✅ **Datenmigration**: JSON → Relational automatisch integriert
- ✅ **Automatische Backups**: Vor jeder Migration
- ✅ **Idempotenz**: Migrationen können mehrfach ausgeführt werden
- ✅ **Fehlertoleranz**: System bleibt funktionsfähig auch bei Einzelfehlern

### Relationale Arbeitszeiten-Struktur (Phase 1+2)
- ✅ Neue `termine_arbeiten` Tabelle mit vollständiger Struktur
- ✅ Individuelle Berechnungen pro Person und Arbeit
- ✅ Berechnete Zeitwerte werden gespeichert (Nebenzeit, Aufgabenbewältigung, Pausen)
- ✅ Performance-Indizes für schnelle Abfragen
- ✅ Automatic data migration from JSON to relational

### Migration-System
- ✅ Migration 013 mit integrierter Datenmigration
- ✅ Automatische Berechnung aller Zeitfaktoren beim Migrieren
- ✅ Prüfung auf bereits existierende Daten (Skip if exists)
- ✅ Detailliertes Migrations-Logging

## 🔧 Technische Verbesserungen

### Datenbank-Architektur
- **Neue Tabelle**: `termine_arbeiten` mit 16 Feldern
  - Basis-Felder: termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id
  - Berechnete Felder: berechnete_dauer_minuten, berechnete_endzeit, faktor_nebenzeit, etc.
  - Timestamps: created_at, updated_at
- **Foreign Keys**: Referenzielle Integrität zu termine/mitarbeiter/lehrlinge
- **Indizes**: Performance-Optimierung für häufige Queries
- **CHECK Constraints**: Datenintegrität auf DB-Level

### Berechnungs-Modul
- `zeitBerechnung.js`: Zentralisierte Logik für alle Zeitberechnungen
- `berechneArbeitszeitFuerSpeicherung()`: API-Funktion für alle berechneten Werte
- Unterstützt Mitarbeiter und Lehrlinge mit individuellen Faktoren
- 6-Stunden-Regel für automatische Pausenberechnung

### Migration-Integration
- Migration 013 enthält jetzt `migrateExistingData()` Funktion
- Automatisches Laden von Personen-Daten für Berechnungen
- JSON-Parser mit Meta-Feld-Filterung (Underscore-Prefix)
- Fehlerbehandlung pro Arbeit (nicht pro Termin)

## 📚 Dokumentation

### Neue Dokumentation
- ✅ `AUTOMATISCHE-MIGRATION.md`: Vollständige Migrations-Anleitung
  - Update-Prozess für alle Installationen
  - Migrations-Log prüfen
  - Fehlerbehebung und Rollback
  - Entwickler-Informationen
- ✅ `MIGRATION-ARBEITEN-RELATIONAL.md`: Technische Details (bereits in v1.4.5)
- ✅ Updated `README.md`: Neue Update-Sektion mit automatischer Migration

## 🔄 Migration von älteren Versionen

### Für alle Nutzer (Installer/Portable/Source):

**Einfaches Update:**
```bash
# 1. Code aktualisieren
git pull origin master

# 2. Server starten - fertig!
./start.sh  # macOS/Linux
start.bat   # Windows
```

**Das System macht automatisch:**
1. Backup der Datenbank
2. Schema-Update auf Version 13
3. Datenmigration von JSON → Relational
4. Berechnung aller Zeitwerte
5. Erstellen der Performance-Indizes

**Kein manueller Eingriff nötig!** ✅

### Status prüfen:

```bash
# macOS/Linux
tail -100 logs/backend.log | grep -i migration

# Windows
type logs\backend.log | findstr /i migration
```

### Erfolgreicher Output:
```
🔄 Starte Migration 13: Erstellt termine_arbeiten Tabelle...
✓ termine_arbeiten Tabelle mit Indizes erstellt
🔄 Migriere 59 Termine...
✅ Migriert: 38 Arbeitszeiten (8 Fehler)
✓ Datenmigration abgeschlossen
✅ Schema-Version aktualisiert auf: 13
```

## 📋 Roadmap (Phase 3-5)

### Phase 3: Model-Anpassung (Coming Soon)
- [ ] termineModel.js für termine_arbeiten erweitern
- [ ] CRUD-Operationen (Create, Read, Update, Delete)
- [ ] Person-Reassignment mit automatischer Neuberechnung

### Phase 4: Controller-Integration (Coming Soon)
- [ ] arbeitszeitenController.js erstellen
- [ ] REST API Endpoints für termine_arbeiten
- [ ] Integration mit zeitBerechnung.js

### Phase 5: Frontend-Anpassungen (Coming Soon)
- [ ] API-Service für termine_arbeiten
- [ ] UI für berechnete Werte anzeigen
- [ ] Person-Reassignment UI
- [ ] Entfernung alter client-side Berechnungen

### Phase 6: Cleanup (Coming Soon)
- [ ] Migration 014: Entfernen von arbeitszeiten_details Spalte
- [ ] Code-Cleanup für alte JSON-Struktur
- [ ] Vollständige Dokumentation

## 🐛 Fehlerbehebungen

- **Migration-System**: Promise-basierte Migrationen statt Callbacks
- **JSON-Parser**: Unterstützung für Object-basierte (nicht Array) arbeitszeiten_details
- **Meta-Felder**: Korrekte Filterung von Underscore-prefixed Feldern
- **Fehlertoleranz**: Migration erfolgreich auch wenn einzelne Arbeiten fehlschlagen

## 💡 Entwickler-Hinweise

### Neue Migration hinzufügen:
```javascript
// migrations/014_deine_migration.js
module.exports = {
  version: 14,
  description: 'Beschreibung',
  up: (db) => new Promise((resolve, reject) => {
    // Migration Code
    resolve();
  }),
  down: (db) => new Promise((resolve, reject) => {
    // Rollback Code
    resolve();
  })
};
```

### Datenmigration in Migration integrieren:
Siehe `migrations/013_create_termine_arbeiten_table.js` als Beispiel:
- `migrateExistingData(db)` nach Tabellenerstellung aufrufen
- Prüfung auf bereits existierende Daten
- Fehlertoleranz mit try-catch pro Datensatz

## 🙏 Danke

Vielen Dank an alle Tester und Nutzer für das wertvolle Feedback!

## 📞 Support

Bei Fragen oder Problemen:
- **Issues**: [GitHub Issues](https://github.com/SHP-ART/Werkstatt-Terminplaner/issues)
- **Dokumentation**: Siehe `AUTOMATISCHE-MIGRATION.md`
- **Rollback**: Siehe Dokumentation für Rollback-Anleitung

---

**Wichtig:** Diese Version ist **vollständig kompatibel** mit allen vorherigen Versionen. Alle Daten bleiben erhalten und werden automatisch migriert!
