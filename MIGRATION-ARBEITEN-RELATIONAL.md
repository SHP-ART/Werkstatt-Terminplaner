# Migration termine_arbeiten: Relationale Arbeitszeit-Struktur

**Status:** ✅ Erfolgreich abgeschlossen (Phase 1+2)  
**Datum:** 02.02.2026

## Übersicht

Umstellung von JSON-basierter Arbeitszeitspeicherung (`arbeitszeiten_details` Feld) auf eine vollständig relationale Struktur mit separater `termine_arbeiten` Tabelle.

## Durchgeführte Schritte

### 1. Migration 013: Tabellenerstellung ✅
- **Datei:** `backend/migrations/013_create_termine_arbeiten_table.js`
- **Schema-Version:** 12 → 13
- **Tabelle:** `termine_arbeiten` mit:
  - Arbeitsdetails (arbeit, zeit, mitarbeiter_id, lehrling_id, startzeit, reihenfolge)
  - 6 berechnete Zeitfelder (berechnete_dauer_minuten, berechnete_endzeit, faktoren, pausen)
  - Foreign Keys zu termine, mitarbeiter, lehrlinge
  - 3 Performance-Indizes
- **Status:** Erfolgreich ausgeführt, Tabelle erstellt

### 2. Datenmigration: JSON → Relational ✅
- **Skript:** `backend/migrate-arbeitszeiten-to-table.js`
- **Migriert:** 38 Arbeitszeiteinträge aus 59 Terminen
- **Übersprungen:** 24 Termine (leere arbeitszeiten_details)
- **Fehler:** 8 Einträge (Datenkonsistenz-Probleme: fehlende Personen, ungültige Zeiten)

#### Migrationslogik:
1. Parse JSON-Objekt aus `termine.arbeitszeiten_details`
2. Filtere Meta-Felder (Keys mit `_` Präfix)
3. Für jede Arbeit:
   - Extrahiere Arbeitsnamen (Key) und Details (Value)
   - Identifiziere zugeordnete Person (mitarbeiter_id/lehrling_id)
   - Berechne Zeiten mit `zeitBerechnung.berechneArbeitszeitFuerSpeicherung()`
   - Insert in `termine_arbeiten` mit berechneten Werten

#### Erkannte Datenformate:
```json
// Format 1: Einfach (nur Zeit als Zahl)
{"Lüfter ein/Ausbauen": 60}

// Format 2: Detailliert (Objekt mit zusätzlichen Feldern)
{"Kontrolle Auspuff": {"zeit": 60, "lehrling_id": 1, "type": "lehrling"}}

// Format 3: Mit Meta-Daten
{
  "_gesamt_mitarbeiter_id": {"type": "lehrling", "id": 1},
  "_startzeit": "08:30",
  "Arbeit 1": 60,
  "Arbeit 2": 120
}
```

### 3. Berechnungslogik ✅
- **Datei:** `backend/src/utils/zeitBerechnung.js`
- **Funktionen:**
  - `berechneEffektiveDauer()` - Dauer mit Nebenzeit/Aufgabenbewältigung
  - `berechnePausenzeit()` - Pausenberechnung (6h-Regel)
  - `berechneEndzeit()` - Zeitberechnung
  - `berechneArbeitszeitFuerSpeicherung()` - Haupt-API-Funktion
- **Status:** Implementiert, bereit für Integration

## Datenbankstruktur

### termine_arbeiten Tabelle
```sql
CREATE TABLE termine_arbeiten (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  termin_id INTEGER NOT NULL,
  
  -- Arbeitsdetails
  arbeit TEXT NOT NULL,
  zeit INTEGER NOT NULL,  -- Geplante Zeit (Minuten)
  mitarbeiter_id INTEGER,
  lehrling_id INTEGER,
  startzeit TEXT,
  reihenfolge INTEGER DEFAULT 0,
  
  -- Berechnete Zeitfelder
  berechnete_dauer_minuten INTEGER,
  berechnete_endzeit TEXT,
  faktor_nebenzeit REAL,
  faktor_aufgabenbewaeltigung REAL,
  pause_enthalten INTEGER DEFAULT 0,
  pause_minuten INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign Keys & Constraints
  FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE CASCADE,
  FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE SET NULL,
  FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id) ON DELETE SET NULL,
  CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL),
  CHECK (zeit > 0)
)
```

### Indizes
- `idx_termine_arbeiten_termin_id` - Schneller Zugriff pro Termin
- `idx_termine_arbeiten_mitarbeiter` - Mitarbeiter-Abfragen
- `idx_termine_arbeiten_lehrling` - Lehrling-Abfragen

## Daten-Validierung

### Erfolgreich migrierte Beispiele:
```sql
-- Termin 1: Lehrling-Arbeit
termin_id: 1
arbeit: "Lüfter ein/Ausbauen und Reinigen"
zeit: 60
lehrling_id: 1
berechnete_dauer_minuten: 60

-- Termin 6: Mitarbeiter-Arbeit mit Startzeit
termin_id: 6
arbeit: "Zahnriemen"
zeit: 240
mitarbeiter_id: 2
startzeit: "08:30"
```

### Fehlerhafte Daten (nicht migriert):
1. **Keine Person zugeordnet** (5 Fälle)
   - Termine: 5, 421, 430, 474
   - Problem: Weder mitarbeiter_id noch lehrling_id vorhanden

2. **Ungültige Zeit** (3 Fälle)
   - Termine: 425, 427
   - Problem: zeit = 0 oder undefined

## Nächste Schritte (noch offen)

### 3. termineModel.js Anpassung
- [ ] Neue Funktionen für termine_arbeiten CRUD
- [ ] `getArbeitenByTerminId(terminId)`
- [ ] `createArbeit(terminId, arbeitData)`
- [ ] `updateArbeit(arbeitId, arbeitData)` mit Neuberechnung
- [ ] `deleteArbeit(arbeitId)`
- [ ] `reassignArbeit(arbeitId, personId)` mit automatischer Neuberechnung

### 4. Controller-Integration
- [ ] `arbeitszeitenController.js` für neue Endpoints
- [ ] POST `/api/termine/:id/arbeiten` - Arbeit hinzufügen
- [ ] PUT `/api/arbeiten/:id` - Arbeit bearbeiten
- [ ] DELETE `/api/arbeiten/:id` - Arbeit löschen
- [ ] PUT `/api/arbeiten/:id/reassign` - Person neu zuweisen (triggert Neuberechnung)

### 5. Frontend-Anpassungen
- [ ] API-Service erweitern (`services/api.js`)
- [ ] Termin-Detail-View anpassen (berechnete Werte anzeigen)
- [ ] Arbeitszeit-Formular erweitern (Person-Zuordnung)
- [ ] Echtzeit-Updates via WebSocket für Neuberechnungen

### 6. Alte Struktur entfernen
- [ ] Migration 014: `ALTER TABLE termine DROP COLUMN arbeitszeiten_details`
- [ ] Cleanup alter Code-Referenzen

## Rollback-Hinweise

Falls Probleme auftreten:

1. **Migration rückgängig machen:**
   ```bash
   cd backend
   node -e "require('./migrations/013_create_termine_arbeiten_table').down(require('sqlite3').Database('./database/werkstatt.db'))"
   ```

2. **Backup wiederherstellen:**
   ```bash
   cp backend/backups/werkstatt_backup_2026-02-02T18-41-15.db backend/database/werkstatt.db
   ```

## Testing

**Datenmigration:** ✅ Getestet mit 59 Terminen
- 38 Arbeitszeiten erfolgreich migriert
- 8 Fehler durch Datenkonsistenz-Probleme (dokumentiert)

**Tabellenerstellung:** ✅ Schema validiert
- Alle Felder vorhanden
- Indizes aktiv
- Foreign Keys funktional

**Berechnung:** ⏳ Noch zu testen
- Unit-Tests für zeitBerechnung.js ausstehend
- Integration-Tests für Controller ausstehend
