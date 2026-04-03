# Arbeitspause — Design Spec

**Datum:** 2026-04-03  
**Status:** Approved

## Überblick

Mitarbeiter und Meister können eine laufende Arbeit pausieren. Pausierte Aufträge werden im Intern-Tab und in der Tablet-Vollbildansicht visuell hervorgehoben. Der Fortschrittstimer friert ein. Die Pause wird manuell beendet.

## Anforderungen

- **Auslöser:** Sowohl der Mitarbeiter selbst (am Tablet) als auch der Meister/Admin (im Intern-Tab)
- **Gründe:** Pflichtangabe bei Pause-Start:
  - `teil_fehlt` — Teil fehlt / wird noch geliefert
  - `rueckfrage_kunde` — Rückfrage beim Kunden nötig
  - `vorrang` — Vorrang für dringendere Arbeit
- **Zeitverhalten:** Timer stoppt — Fortschrittsbalken friert auf aktuellem Wert ein
- **Beenden:** Manuell per "Fortsetzen"-Button, kein automatischer Ablauf

## Datenbank

### Migration 030 — neue Tabelle `arbeitspausen`

```sql
CREATE TABLE arbeitspausen (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  termin_id        INTEGER NOT NULL,
  mitarbeiter_id   INTEGER,
  lehrling_id      INTEGER,
  grund            TEXT NOT NULL,   -- 'teil_fehlt' | 'rueckfrage_kunde' | 'vorrang'
  gestartet_am     DATETIME NOT NULL,
  beendet_am       DATETIME,        -- NULL = noch aktiv
  FOREIGN KEY (termin_id) REFERENCES termine(id)
);

CREATE INDEX idx_arbeitspausen_termin ON arbeitspausen(termin_id);
CREATE INDEX idx_arbeitspausen_aktiv ON arbeitspausen(beendet_am) WHERE beendet_am IS NULL;
```

Mehrere Pausen pro Termin möglich — vollständige Pausen-Historie erhalten.  
`DATENBANK.md` wird mit Tabellenbeschreibung und Migration 030 aktualisiert.

## Backend

### Datei: `backend/migrations/030_arbeitspausen.js`

Migration erstellt die Tabelle `arbeitspausen`.

### Datei: `backend/src/controllers/arbeitspausenController.js`

Methoden:

| Methode | Beschreibung |
|---------|-------------|
| `starten(req, res)` | Prüft ob Termin `in_arbeit` ist, prüft keine aktive Pause vorhanden, legt Eintrag an |
| `beenden(req, res)` | Setzt `beendet_am = NOW()` für aktive Pause des Termins |
| `getAktive(req, res)` | Gibt alle Zeilen mit `beendet_am IS NULL` zurück |

### Datei: `backend/src/routes/arbeitspausen.js`

```
POST /api/arbeitspausen/starten   Body: { termin_id, mitarbeiter_id|lehrling_id, grund }
POST /api/arbeitspausen/beenden   Body: { termin_id }
GET  /api/arbeitspausen/aktive
```

### Datei: `backend/src/routes/index.js`

Route `/api/arbeitspausen` registrieren.

## Frontend: Intern-Tab

### `loadInternTeamUebersicht()` in `app.js`

Lädt aktive Arbeitspausen parallel zu Terminen und Mittagspausen:

```js
const [termine, aktiveMittagspausen, aktiveArbeitspausen] = await Promise.all([
  TermineService.getAllMitPausen(datum),
  fetch(`${CONFIG.API_URL}/pause/aktive`).then(r => r.json()),
  fetch(`${CONFIG.API_URL}/arbeitspausen/aktive`).then(r => r.json()),
]);
```

`aktiveArbeitspausen` wird an `renderInternPersonKachel()` im `kontext`-Objekt übergeben.

### `renderInternPersonKachel()` in `app.js`

Erweiterungen:

1. **Pause-Erkennung:** Prüft ob `aktuellerAuftrag.id` in `aktiveArbeitspausen` vorkommt
2. **Badge:** Wenn pausiert → `⏸️ Pausiert` (grauer Badge) statt `🔧 In Arbeit`
3. **Kachel-Style (Variante C):**
   - Grauer Rahmen (`border-color: #636e72`)
   - Gelber Akzentbalken links (`border-left: 5px solid #fdcb6e`)
   - Zeile "Pausiert seit HH:MM Uhr" unterhalb Auftragsname
4. **Fortschrittsbalken:** Eingefroren — Prozentwert wird zum Zeitpunkt des Pause-Starts berechnet (`gestartet_am` aus `arbeitspausen`) und statisch angezeigt, nicht weiter hochgezählt
5. **Buttons:**
   - `in_arbeit` ohne Pause → Button `⏸️ Pause` → öffnet Pause-Modal
   - Pausiert → Button `▶️ Fortsetzen` → direkter API-Call `POST /arbeitspausen/beenden`

### Pause-Modal

Einfacher inline-Dialog (kein separates Modal-Element, analog zu bestehenden Confirm-Dialogen):

```
Warum wird die Arbeit unterbrochen?
○ ⏳ Teil fehlt / wird geliefert
○ ❓ Rückfrage beim Kunden
○ 🔀 Vorrang dringenderer Auftrag
[ Pausieren ]  [ Abbrechen ]
```

Nach `POST /arbeitspausen/starten` → `loadInternTeamUebersicht()` neu laden.

## Frontend: Tablet-Vollbildansicht

### `interner-termin-vollbild.html`

- Beim Laden: `GET /api/arbeitspausen/aktive` prüfen ob der angezeigte Termin pausiert ist
- Button oben rechts (neben bestehenden Aktionsbuttons):
  - Nicht pausiert: `⏸️ Pause` → Pause-Modal → API-Call
  - Pausiert: `▶️ Fortsetzen` (grün) → direkter API-Call → Button-Zustand wechseln
- Gleiches Pause-Modal wie im Intern-Tab

## Nicht im Scope

- Automatisches Beenden der Arbeitspause nach Zeitlimit
- Push-Benachrichtigung wenn Pause beendet wird
- Reporting/Auswertung der Arbeitspausen
- Verschieben von Folgeterminen (anders als bei Mittagspause — Arbeitspause hat unbekannte Dauer)
