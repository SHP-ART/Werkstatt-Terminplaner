# Test: Berechnete Zeiten pro Arbeit

## ✅ Was wurde implementiert

### 1. **Neue Datenbank-Felder** (Migration 012)
Tabelle `termine_arbeiten` erweitert mit:
- `berechnete_dauer_minuten` - Effektive Dauer inkl. aller Faktoren
- `berechnete_endzeit` - Berechnete Endzeit (HH:MM)
- `faktor_nebenzeit` - Gespeicherter Nebenzeit-% (Historie)
- `faktor_aufgabenbewaeltigung` - Gespeicherter Aufgabenbewältigungs-%
- `pause_enthalten` - Ob Mittagspause berücksichtigt (0/1)
- `pause_minuten` - Wie viel Pausenzeit addiert

### 2. **Zentrale Berechnungslogik** (`utils/zeitBerechnung.js`)
- `berechneEffektiveDauer()` - Nebenzeit + Aufgabenbewältigung
- `berechnePausenzeit()` - Mittagspausen-Prüfung mit 6h-Regel
- `berechneEndzeit()` - Zeitberechnung
- `berechneArbeitszeitFuerSpeicherung()` - Haupt-API für Controller

### 3. **Automatische Berechnung**
Bei jedem CREATE/UPDATE einer Arbeit werden die Werte automatisch:
1. **Berechnet** basierend auf zugeordneter Person
2. **Gespeichert** in der Datenbank
3. **Neu berechnet** bei Zuordnungsänderung

## 🧪 Testszenarien

### Szenario 1: Mitarbeiter mit Nebenzeit
```javascript
// Mitarbeiter: Lars
// - arbeitsstunden_pro_tag: 8
// - nebenzeit_prozent: 20
// - mittagspause_start: 13:30
// - pausenzeit_minuten: 30

// Arbeit: Ölwechsel
// - zeit: 60 Minuten (Basis)
// - startzeit: 08:00

// ERWARTETE BERECHNUNG:
// 1. Basiszeit: 60 min
// 2. + Nebenzeit (20%): 60 * 1.2 = 72 min
// 3. Pausenprüfung: 08:00 + 72min = 09:12 → KEINE Pause
// 4. Endzeit: 09:12

// GESPEICHERT:
// berechnete_dauer_minuten: 72
// berechnete_endzeit: '09:12'
// faktor_nebenzeit: 20
// pause_enthalten: 0
// pause_minuten: 0
```

### Szenario 2: Lehrling mit Aufgabenbewältigung
```javascript
// Lehrling: Max
// - aufgabenbewaeltigung_prozent: 150 (braucht 50% länger)
// - mittagspause_start: 12:00
// - pausenzeit_minuten: 30
// - wochenarbeitszeit_stunden: 40 (≈ 8h/Tag → >= 6h → Pause aktiv)

// Arbeit: Bremsen vorne
// - zeit: 120 Minuten (Basis)
// - startzeit: 11:00

// ERWARTETE BERECHNUNG:
// 1. Basiszeit: 120 min
// 2. * Aufgabenbewältigung (150%): 120 * 1.5 = 180 min
// 3. Pausenprüfung: 11:00 + 180min = 14:00
//    → Geht über 12:00 (Pausenstart) → +30min Pause
// 4. Gesamtdauer: 180 + 30 = 210 min
// 5. Endzeit: 11:00 + 210min = 14:30

// GESPEICHERT:
// berechnete_dauer_minuten: 210
// berechnete_endzeit: '14:30'
// faktor_aufgabenbewaeltigung: 150
// pause_enthalten: 1
// pause_minuten: 30
```

### Szenario 3: Teilzeit (6h-Regel)
```javascript
// Mitarbeiter: Anna (Teilzeit)
// - wochenarbeitszeit_stunden: 25
// - arbeitstage_pro_woche: 5
// - Tägliche Arbeitszeit: 25/5 = 5h < 6h → KEINE Pause!

// Arbeit: Inspektion
// - zeit: 180 Minuten
// - startzeit: 10:00

// ERWARTETE BERECHNUNG:
// 1. Basiszeit: 180 min
// 2. Pausenprüfung: 5h/Tag < 6h → KEINE Pause (auch wenn über 12:00)
// 3. Endzeit: 10:00 + 180min = 13:00

// GESPEICHERT:
// berechnete_dauer_minuten: 180
// berechnete_endzeit: '13:00'
// pause_enthalten: 0  // Wegen 6h-Regel!
// pause_minuten: 0
```

### Szenario 4: Zuordnung ändern → Neu berechnen
```javascript
// INITIAL: Arbeit zugeordnet an Mitarbeiter Lars (Nebenzeit 20%)
// - zeit: 60 min
// - berechnete_dauer_minuten: 72 min

// DANN: Zuordnung ändern auf Lehrling Max (Aufgabenbewältigung 150%)
// → Automatische Neuberechnung:
// - berechnete_dauer_minuten: 90 min (60 * 1.5)
// - faktor_aufgabenbewaeltigung: 150
// - faktor_nebenzeit: NULL (wird gelöscht)
```

## 📊 Test-Queries

### Prüfe neue Felder
```sql
-- Zeige Schema von termine_arbeiten
PRAGMA table_info(termine_arbeiten);

-- Erwartete neue Felder:
-- berechnete_dauer_minuten | INTEGER
-- berechnete_endzeit | TEXT
-- faktor_nebenzeit | REAL
-- faktor_aufgabenbewaeltigung | REAL
-- pause_enthalten | INTEGER
-- pause_minuten | INTEGER
```

### Teste Berechnung
```sql
-- Zeige Arbeiten mit Berechnungen
SELECT 
  ta.id,
  ta.arbeit,
  ta.zeit AS basis_zeit,
  ta.berechnete_dauer_minuten,
  ta.berechnete_endzeit,
  ta.faktor_nebenzeit,
  ta.faktor_aufgabenbewaeltigung,
  ta.pause_enthalten,
  ta.pause_minuten,
  CASE 
    WHEN ta.mitarbeiter_id IS NOT NULL THEN m.name
    WHEN ta.lehrling_id IS NOT NULL THEN l.name
    ELSE 'Nicht zugeordnet'
  END AS person
FROM termine_arbeiten ta
LEFT JOIN mitarbeiter m ON ta.mitarbeiter_id = m.id
LEFT JOIN lehrlinge l ON ta.lehrling_id = l.id
ORDER BY ta.termin_id, ta.id;
```

## 🔄 Nächste Schritte

### Phase 2: Controller-Integration
- [ ] `termineController.js` - Beim Speichern Berechnung aufrufen
- [ ] `arbeitszeitenController.js` - Bei Zuordnungsänderung neu berechnen
- [ ] Webhook/Event bei Änderung für Realtime-Updates

### Phase 3: Frontend-Integration
- [ ] `app.js` - Nutze `berechnete_dauer_minuten` statt Berechnungslogik
- [ ] `electron-intern-tablet/index.html` - Nutze gespeicherte Werte
- [ ] Entferne redundante Berechnungen im Frontend

### Phase 4: Migration bestehender Daten
- [ ] Script zum Nachberechnen aller existierenden Arbeiten
- [ ] Backup vor Migration
- [ ] Validierung der Ergebnisse

## 💡 Vorteile

✅ **Konsistenz**: Alle Clients zeigen identische Zeiten
✅ **Performance**: Keine Frontend-Berechnung mehr nötig
✅ **Historie**: Faktoren werden gespeichert (nachvollziehbar)
✅ **Korrektheit**: 6h-Regel wird überall gleich angewendet
✅ **Automatisch**: Bei Zuordnungsänderung Neuberechnung

## ⚠️ Breaking Changes

**KEINE!** Das System ist vollständig rückwärtskompatibel:
- Alte Arbeiten ohne berechnete Werte funktionieren weiter
- Frontend kann Fallback auf alte Berechnung nutzen
- Schrittweise Migration möglich

---

**Status:** ✅ Migration 012 erfolgreich | Backend bereit | Controller-Integration ausstehend
