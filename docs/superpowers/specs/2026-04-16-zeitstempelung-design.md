# Design-Spec: Zeitstempelung

**Datum:** 2026-04-16  
**Status:** Genehmigt  
**Projekt:** Werkstatt-Terminplaner v1.6.2

---

## Zusammenfassung

Ein neuer Tab "Zeitstempelung" zeigt tagesbasiert alle Mitarbeiter mit ihren geleisteten Arbeiten, Startzeit, Endzeit und geschätzter Zeit. Stempelzeiten werden über den Intern Tab, die Tablet App (Echtzeit) und den Plan Beta Tab (manuell/rückwirkend) erfasst.

---

## Anforderungen

### Neuer Tab "Zeitstempelung"
- Neuer Tab-Button `🕐 Zeitstempelung` in der bestehenden Tab-Leiste (nach "👷 Intern", vor "🗑️ Papierkorb")
- Datumsauswahl: Pfeil-Buttons (← Datum →) und direkter Datepicker
- Tabellenansicht **gruppiert nach Mitarbeiter**: je Mitarbeiter eine Gruppe mit Kopfzeile
- Kopfzeile zeigt: Name + Gesamtsumme geschätzte Zeit + Gesamtsumme Ist-Zeit
- Pro Arbeit eine Zeile: Auftragsnummer, Kennzeichen, Arbeitsbezeichnung, Startzeit (grün), Endzeit (rot), Geschätzte Zeit (gelb), Ist-Zeit (blau/orange bei Überschreitung)
- Lehrling und Mitarbeiter werden gleich behandelt (beide in der Übersicht)
- Fehlende Stempel zeigen "—"; laufende Arbeiten zeigen "laufend…"
- Ist-Zeit = Differenz `stempel_ende - stempel_start`; Warnung (🟠) bei > 10% Überschreitung der geschätzten Zeit
- Tab ist für alle Benutzer sichtbar (keine Rolleneinschränkung)
- Rückwirkende Ansicht: beliebiges Datum wählbar

### Ergänzung: Intern Tab
- Pro Arbeit (`termine_arbeiten`-Zeile) zwei Buttons: **▶ Starten** und **■ Ende**
- Wurde noch nicht gestartet: "▶ Starten" aktiv, "■ Ende" deaktiviert
- Wurde gestartet: Startzeit angezeigt (grün), "■ Ende" aktiv
- Wurde beendet: beide Zeiten angezeigt, Buttons deaktiviert
- Einfache Aufträge (1 Arbeit): ein Stempel-Paar
- Multi-Arbeiten-Aufträge: je Arbeit ein eigenes Stempel-Paar
- Stempel setzt `termine_arbeiten.stempel_start` / `stempel_ende` mit aktueller Uhrzeit (HH:MM)

### Ergänzung: Tablet App (electron-intern-tablet)
- Gleiches Verhalten wie Intern Tab: Start/Ende-Buttons pro Arbeit
- Einfache Aufträge: ein "▶ Starten"-Button (ersetzt / ergänzt bestehenden Start-Button)
- Multi-Arbeiten: Liste der Einzelarbeiten mit je eigenem Start/Ende-Button
- Bestehender `internStarten`-Aufruf bleibt erhalten (setzt weiterhin `termine.startzeit`), zusätzlich wird `stempel_start` in `termine_arbeiten` gesetzt

### Ergänzung: Plan Beta Tab (🏗️ Planung & Zuweisung)
- Pro Auftragszeile: aufklappbares Panel mit Zeitfeldern je Arbeit
- Felder: `START-ZEIT` (time-Input), `ENDE-ZEIT` (time-Input), Speichern-Button
- Für rückwirkende manuelle Einträge (auch vergangene Daten)
- Zeigt aktuelle gespeicherte Stempelwerte wenn vorhanden

---

## Datenmodell

### Migration 031 — `termine_arbeiten` erweitern

```sql
ALTER TABLE termine_arbeiten ADD COLUMN stempel_start TEXT;
ALTER TABLE termine_arbeiten ADD COLUMN stempel_ende TEXT;
```

- Format: `HH:MM` (konsistent mit bestehenden Zeitfeldern wie `startzeit`)
- `NULL` = nicht gestempelt
- Bestehende Zeilen bleiben unverändert (rückwärtskompatibel)

---

## Backend

### Neuer API-Endpunkt: Stempel setzen

```
PUT /api/termine-arbeiten/:id/stempel
Body: { stempel_start?: "HH:MM", stempel_ende?: "HH:MM" }
Response: { changes: 1, message: "Stempel gesetzt" }
```

- Validierung: Format HH:MM, gültige Uhrzeit
- `stempel_start` und `stempel_ende` können einzeln gesetzt werden
- WebSocket-Event: `stempel.updated` mit `{ termin_id, arbeit_id }`

### Neuer API-Endpunkt: Tagesübersicht

```
GET /api/stempelzeiten?datum=YYYY-MM-DD
Response: Array von Mitarbeiter-Gruppen mit deren Arbeiten
```

Datenstruktur Response:
```json
[
  {
    "person_typ": "mitarbeiter",
    "person_id": 1,
    "name": "Max Mustermann",
    "gesamt_geschaetzt_min": 175,
    "gesamt_ist_min": 190,
    "arbeiten": [
      {
        "id": 42,
        "termin_id": 412,
        "termin_nr": "T-2024-0412",
        "kennzeichen": "WN-AB 123",
        "arbeit": "Ölwechsel",
        "zeit_min": 45,
        "stempel_start": "08:15",
        "stempel_ende": "09:00",
        "ist_min": 45
      }
    ]
  }
]
```

SQL-Join: `termine_arbeiten` → `termine` (für datum, termin_nr, kennzeichen) → `mitarbeiter` / `lehrlinge`

### Neue Dateien
- `backend/src/routes/stempelzeitenRoutes.js`
- `backend/src/controllers/stempelzeitenController.js`
- `backend/migrations/031_stempel_felder.js`

### Bestehende Dateien (Ergänzung)
- `backend/src/routes/index.js` — neuen Router mounten: `/api/stempelzeiten`

---

## Frontend

### Neue Dateien
- Kein separates File — Tab-Inhalt wird als neuer Abschnitt in `frontend/index.html` eingefügt
- Tab-Logik (Laden, Rendern) in `frontend/src/components/app.js`

### Geänderte Dateien

**`frontend/index.html`**
- Neuer Tab-Button: `<button class="tab-button" data-tab="zeitstempelung">🕐 Zeitstempelung</button>`
- Neuer Tab-Inhalt: `<div id="zeitstempelung" class="tab-content">…</div>`

**`frontend/src/components/app.js`**
- `loadZeitstempelung(datum)` — API-Aufruf + Render
- `renderZeitstempelungGruppe(gruppe)` — HTML für eine Mitarbeiter-Gruppe
- `stempelSetzen(arbeitId, typ)` — PUT auf `/api/termine-arbeiten/:id/stempel`
- Intern-Tab: `internStarten` / `internBeenden` um per-Arbeit-Stempel erweitern
- Plan Beta Tab: Stempel-Felder pro Arbeit ergänzen

**`frontend/src/services/api.js`**
- Keine Änderung nötig (generisches `put`/`get` wird genutzt)

### Tablet App (`electron-intern-tablet/`)
- Bestehende Auftrags-Karten um per-Arbeit Start/Ende-Buttons erweitern
- API-Aufruf identisch: `PUT /api/termine-arbeiten/:id/stempel`

---

## Fehlerbehandlung

- Fehlendes Datum → Heute als Default
- Kein Eintrag für gewähltes Datum → leere Ansicht mit Hinweistext "Keine Arbeiten für diesen Tag"
- API-Fehler beim Stempel setzen → Alert + Button wieder aktivieren (wie bestehende Intern-Buttons)
- Ungültiges Zeitformat (manuelle Eingabe) → Validierung vor Speichern

---

## Styling-Vorgabe

Der neue Tab muss **visuell identisch** mit den bestehenden Tabs aussehen:
- Gleiche CSS-Klassen wie bestehende Tab-Inhalte (`tab-content`, `card`, `table`, etc.)
- Gleiche Farben, Abstände, Schriftgrößen — kein eigenes Stylesheet
- Tabellen analog zum Auslastungs- oder Intern-Tab aufgebaut
- Buttons: gleiche Klassen wie `intern-tab-btn`, `intern-tab-btn-confirm`, `intern-tab-btn-complete`
- Datumsauswahl: gleicher Stil wie bestehende Datumsfelder im App
- Kein inline-Style außer dort wo unbedingt nötig — bestehende CSS-Klassen nutzen

---

## Nicht im Scope

- Rollenbasierte Sichtbarkeit (alle sehen den Tab)
- Export / Drucken der Stempelzeiten
- Stempelzeit-Korrekturen mit Verlauf / Audit-Log
- Überstunden-Berechnung oder Lohnabrechnung
