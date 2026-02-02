# Migration von älteren Versionen

## Automatische Migration beim Update

Das System ist **abwärtskompatibel** und migriert alte Daten automatisch:

### ✅ Was passiert automatisch

1. **Migration 010** fügt neue Felder hinzu:
   - `wochenarbeitszeit_stunden` (Standard: 40h)
   - `arbeitstage_pro_woche` (Standard: 5 Tage)
   - `pausenzeit_minuten` (Standard: 30 min)
   - `samstag_*` Felder (Standard: inaktiv)

2. **Bestehende Daten** bleiben erhalten:
   - Alte `arbeitsstunden_pro_tag` bleibt als Fallback
   - System nutzt automatisch alte Werte wenn neue nicht gesetzt

3. **Alte Abwesenheiten-Tabelle** wird umbenannt:
   - `abwesenheiten` → `abwesenheiten_legacy`
   - Neue Tabelle `abwesenheiten` mit erweiterten Features

### 🔄 Intelligente Konvertierung (optional)

Für eine vollständige Migration der alten Werte:

```bash
cd backend
node convert-old-data.js
```

**Das Script macht:**
- Konvertiert `arbeitsstunden_pro_tag` × 5 = `wochenarbeitszeit_stunden`
- Beispiel: 8h/Tag → 40h/Woche
- Überschreibt nur Standard-Werte (40h)
- Bereits konfigurierte Werte bleiben unverändert

### 📊 Beispiel-Konvertierung

**Vorher (v1.0-1.3):**
```
Mitarbeiter: Max Mustermann
├─ arbeitsstunden_pro_tag: 8
└─ (keine Wochenarbeitszeit)
```

**Nach Migration:**
```
Mitarbeiter: Max Mustermann
├─ arbeitsstunden_pro_tag: 8 (bleibt als Fallback)
├─ wochenarbeitszeit_stunden: 40 (8 × 5)
├─ arbeitstage_pro_woche: 5
├─ pausenzeit_minuten: 30
└─ samstag_aktiv: 0
```

### 🎯 Fallback-Logik im Code

Die neue Kapazitätsberechnung prüft beide Systeme:

```javascript
// 1. Versuche neue Wochenarbeitszeit zu nutzen
if (person.wochenarbeitszeit_stunden) {
  kapazitaet = (wochenarbeitszeit_stunden / arbeitstage_pro_woche × 60) - pause;
}

// 2. Fallback auf altes System
else if (person.arbeitsstunden_pro_tag) {
  kapazitaet = (arbeitsstunden_pro_tag × 60) - pause;
}
```

**Ergebnis:** System funktioniert mit alten UND neuen Daten! ✅

---

## Manuelle Migration

Falls Sie individuelle Anpassungen vornehmen möchten:

### 1. Prüfen Sie bestehende Werte

```sql
SELECT 
  name,
  arbeitsstunden_pro_tag AS "Alt (h/Tag)",
  wochenarbeitszeit_stunden AS "Neu (h/Woche)",
  arbeitstage_pro_woche AS "Arbeitstage"
FROM mitarbeiter;
```

### 2. Manuelle Anpassung für einzelne Mitarbeiter

```sql
UPDATE mitarbeiter 
SET wochenarbeitszeit_stunden = 38.5,  -- Teilzeit
    arbeitstage_pro_woche = 5,
    pausenzeit_minuten = 30
WHERE name = 'Anna Müller';
```

### 3. Samstagsarbeit aktivieren

```sql
UPDATE mitarbeiter
SET samstag_aktiv = 1,
    samstag_start = '08:00',
    samstag_ende = '13:00',
    samstag_pausenzeit_minuten = 15
WHERE name = 'Max Mustermann';
```

---

## Abwesenheiten migrieren

### Legacy-Tabelle prüfen

```sql
SELECT * FROM abwesenheiten_legacy ORDER BY datum DESC LIMIT 10;
```

### In neue Struktur übertragen

Alte Struktur (pro Datum):
```sql
-- abwesenheiten_legacy
datum      | urlaub | krank
2026-02-01 | 2      | 1
```

Neue Struktur (pro Person + Zeitraum):
```sql
-- abwesenheiten
id | mitarbeiter_id | typ     | datum_von  | datum_bis  | beschreibung
1  | 5              | urlaub  | 2026-02-01 | 2026-02-07 | Winterurlaub
2  | 3              | krank   | 2026-02-01 | 2026-02-03 | Grippe
```

**Migration erfolgt manuell** über die neue UI:
1. Gehe zu **⚙️ Werkstatt-Einstellungen → Mitarbeiter**
2. Klicke auf Tab **🏖️ Urlaub** / **🤒 Krank**
3. Trage bisherige Abwesenheiten neu ein

---

## Fehlerbehebung

### Problem: "Spalte bereits vorhanden"

```bash
# Migration erneut ausführen ist sicher
cd backend
node run-migration-010.js
```

Die Migration prüft, ob Felder bereits existieren und überspringt sie.

**Oder Server neu starten:**
```bash
./start_server.sh
```

### Problem: "Keine Kapazität angezeigt"

**Ursache:** Weder alte noch neue Felder gesetzt.

**Lösung:** 
```bash
cd backend
node convert-old-data.js
```

Oder manuell in UI:
1. **⚙️ Werkstatt-Einstellungen → Mitarbeiter**
2. Wochenarbeitszeit eintragen (z.B. 40h)
3. Speichern

### Problem: "Abwesenheiten verschwunden"

**Ursache:** Alte Tabelle umbenannt.

**Lösung:** Legacy-Tabelle prüfen:
```sql
SELECT * FROM abwesenheiten_legacy;
```

Daten sind noch da, müssen aber neu eingetragen werden (siehe oben).

---

## Versions-Kompatibilität

| Version | arbeitsstunden_pro_tag | wochenarbeitszeit_stunden | Samstag | Abwesenheiten |
|---------|------------------------|---------------------------|---------|---------------|
| v1.0-1.3| ✅ Verwendet           | ❌ Nicht vorhanden        | ❌      | Alte Tabelle  |
| v1.4+   | ⚠️ Fallback            | ✅ Primär                 | ✅      | Neue Tabelle  |

**Update-Pfad:** Alle Versionen → v1.4+ funktioniert ohne Datenverlust! ✅

---

## Support

Bei Problemen:
1. Prüfe `backend/database/werkstatt.db` mit SQLite-Browser
2. Führe `node convert-old-data.js` aus
3. Kontaktiere Support mit Logfiles aus `logs/`
