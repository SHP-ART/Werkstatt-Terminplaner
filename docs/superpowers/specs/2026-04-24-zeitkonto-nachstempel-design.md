# Zeitkonto-Ampel & Tablet-Nachstempelung — Design

**Datum:** 2026-04-24
**Status:** Entwurf zur Implementierung freigegeben
**Betrifft:** Backend (neue Endpunkte + Migration), Frontend Zeitkonto, Tablet-App

---

## 1. Motivation

Im Tab **Zeitverwaltung → Zeitkonto** soll auf einen Blick sichtbar werden, an welchen Tagen Mitarbeiter/Lehrlinge korrekt gestempelt haben. Heute muss der Chef dafür jede Zeile einzeln prüfen.

Zusätzlich soll die Tablet-App beim morgendlichen Kommen-Stempeln den Mitarbeiter daran erinnern, vergessene Stempelungen des Vortags nachzutragen — mit kombiniertem Dialog für fehlende Feierabend-Zeit und Mittagspausen-Ja/Nein-Frage.

---

## 2. Geltungsbereich

- **Enthalten:** Status-Ampel im Zeitkonto, Tablet-Nachstempel-Dialog für letzten Soll-Tag, Inline-Bearbeitung im Zeitkonto, Farb-Legende
- **Nicht enthalten:** Nachtragen für mehr als einen Tag, automatische E-Mail/Push-Benachrichtigungen, Änderungen am Web-Frontend außerhalb Zeitkonto
- **Krank/Urlaub** wird vom Chef manuell eingetragen — das Feature geht davon aus, dass `abwesenheiten` aktuell ist

---

## 3. Status-Regeln (Ampel)

Grundlagen für jeden Tag einer Person:

- **Soll-Tag** = `arbeitszeiten_plan.arbeitsstunden > 0` für diese Person und dieses Datum UND keine Abwesenheit vom Typ `urlaub | krank | lehrgang`
- **Abwesend** = Eintrag in `abwesenheiten` mit Typ `urlaub | krank | lehrgang` der diesen Tag überlappt
- **Hat Kommen** = `tagesstempel.kommen_zeit IS NOT NULL`
- **Hat Gehen** = `tagesstempel.gehen_zeit IS NOT NULL`
- **Hat Mittag** = `pause_tracking`-Eintrag mit `abgeschlossen=1 AND pause_start_zeit IS NOT NULL AND pause_ende_zeit IS NOT NULL` für Person und Datum
- `arbeitsunterbrechungen` zählen **nicht** als Mittag

### Entscheidungstabelle (erste Zeile gewinnt)

`fehlt` ist immer ein Objekt mit drei Booleans: `{ kommen, gehen, mittag }`. `—` bedeutet das Feld wird nicht geliefert (weil nicht nachtragbar).

| # | Bedingung | `status` | `fehlt.kommen` | `fehlt.gehen` | `fehlt.mittag` |
|---|---|---|---|---|---|
| 1 | Kein Soll-Tag UND keine Abwesenheit | `kein_punkt` | — | — | — |
| 2 | Abwesenheit `urlaub \| krank \| lehrgang` | `blau` | — | — | — |
| 3 | Soll-Tag, kein Kommen, kein Gehen, kein Mittag | `rot` | `true` | `true` | `true` |
| 4 | Soll-Tag, Kommen + Gehen + Mittag vorhanden | `gruen` | — | — | — |
| 5 | Soll-Tag, Kommen fehlt (Gehen vorhanden) | `orange` | `true` | `false` | `true` wenn Mittag auch fehlt, sonst `false` |
| 6 | Soll-Tag, Gehen fehlt (Kommen vorhanden) | `orange` | `false` | `true` | `true` wenn Mittag auch fehlt, sonst `false` |
| 7 | Soll-Tag, Kommen + Gehen vorhanden, Mittag fehlt | `gelb` | `false` | `false` | `true` |

### Ist-Minuten-Berechnung

- **`gruen` / `blau` / `kein_punkt`**: unverändert (bestehende Logik in `zeitkontoController.get`)
- **`gelb`**: Ist-Zeit bleibt brutto (Pause nicht abgezogen), bis Nachstempelung Klarheit bringt. Nach Nachstempelung wird automatisch korrekt gerechnet
- **`orange` / `rot`**: Ist-Zeit wie bisher (0 oder teilweise), Saldo wird negativ

### Nachstempel-Fähigkeit

- `nachstempel_moeglich` = true nur beim **letzten Soll-Tag vor heute** mit Status `rot | gelb | orange` UND `tagesstempel.nachgefragt_am IS NULL`
- Das ist der einzige Tag, den der Tablet-Dialog abfragt

---

## 4. Datenmodell-Delta

### Migration `036_nachgefragt_am.js`

1. Spalte hinzufügen:
   ```sql
   ALTER TABLE tagesstempel ADD COLUMN nachgefragt_am TEXT DEFAULT NULL
   ```

2. `tagesstempel.kommen_zeit` von `NOT NULL` auf nullable umstellen (SQLite: neue Tabelle erstellen, Daten kopieren, alte droppen, umbenennen). Grund: Platzhalter-Einträge für "Nein, freier Tag"-Antworten brauchen keinen Kommen-Wert.

3. Retroaktive Initialisierung:
   ```sql
   UPDATE tagesstempel SET nachgefragt_am = erstellt_am WHERE nachgefragt_am IS NULL
   ```
   → Bestands-Einträge werden nicht als "offen" interpretiert; Feature aktiviert sich nur für ab jetzt erzeugte Einträge.

**Keine Änderungen** an `pause_tracking`, `arbeitsunterbrechungen`, `arbeitszeiten_plan`, `mitarbeiter`, `lehrlinge`.

`kommen_quelle` / `gehen_quelle` (`'stempel' | 'manuell'`) existiert bereits — Nachstempelung setzt `'manuell'` wie schon heute bei manuellen Korrekturen.

---

## 5. Backend-Endpunkte

### 5.1 Erweitert: `GET /api/zeitkonto?von=&bis=`

Jeder Eintrag in `person.tage[]` bekommt zusätzlich:

```js
{
  datum: '2026-04-23',
  // ... bestehende Felder ...
  status: 'gruen' | 'gelb' | 'orange' | 'rot' | 'blau' | 'kein_punkt',
  fehlt: { kommen: boolean, gehen: boolean, mittag: boolean },
  nachgefragt_am: null | '2026-04-24 07:03:12'
}
```

Mittag-Check wird an die bestehende Pausen-Abfrage im Controller angehängt. Status-Berechnung als reine Funktion `berechneTagesStatus(...)` — isoliert testbar.

### 5.2 Neu: `GET /api/tagesstempel/nachstempel-check`

**Query:** genau einer von `mitarbeiter_id=X` oder `lehrling_id=Y`

**Response (nachstempel nötig):**
```js
{
  nachstempel_noetig: true,
  datum: '2026-04-23',
  status: 'gelb',
  fehlt: { kommen: false, gehen: false, mittag: true },
  defaults: {
    kommen_zeit: '07:00',          // arbeitszeiten_plan.arbeitszeit_start
    gehen_zeit:  '16:00',          // arbeitszeiten_plan.arbeitszeit_ende
    mittagspause_start: '12:00',   // mitarbeiter.mittagspause_start bzw. lehrlinge.mittagspause_start
    mittagspause_minuten: 30       // einstellungen.mittagspause_minuten
  },
  person: { typ: 'mitarbeiter', id: 5, name: 'Max' }
}
```

**Response (nichts nachzutragen):** `{ nachstempel_noetig: false }`

Sicherheitsventil: letzter Soll-Tag > 30 Tage zurück → immer `{ nachstempel_noetig: false }`.

### 5.3 Neu: `POST /api/tagesstempel/nachstempel`

**Body:**
```js
{
  mitarbeiter_id: 5,               // oder lehrling_id
  datum: '2026-04-23',
  antwort: 'anwesend' | 'nicht_anwesend',
  kommen_zeit: '07:00' | null,
  gehen_zeit:  '16:00' | null,
  mittag_gemacht: true | false | null
}
```

**Ablauf (in Transaction):**
1. `tagesstempel`-Eintrag für (Person, datum) suchen, sonst anlegen (Upsert)
2. Fehlende Zeiten setzen; `kommen_quelle` / `gehen_quelle = 'manuell'`
3. Wenn `mittag_gemacht === true`: `pause_tracking`-Eintrag anlegen mit
   - `pause_start_zeit` = `MIN(mittagspause_start, gehen_zeit − mittagspause_minuten)` (kappt Pause so, dass sie vollständig in die Arbeitszeit passt, selbst wenn Mitarbeiter früher ging)
   - `pause_ende_zeit` = `pause_start_zeit + mittagspause_minuten`
   - `abgeschlossen = 1`
4. `nachgefragt_am = datetime('now')` setzen
5. Transaction committen
6. `broadcastEvent('tagesstempel.nachgestempelt', { mitarbeiter_id | lehrling_id, datum, status_neu })`

**Response:** `{ success: true }`

### 5.4 Neu: `POST /api/tagesstempel/nachstempel/dismiss`

**Body:** `{ mitarbeiter_id | lehrling_id, datum }`

**Ablauf:**
- Nur `nachgefragt_am = datetime('now')` setzen
- Falls kein `tagesstempel`-Eintrag existiert: Platzhalter anlegen (`kommen_zeit=NULL`, `gehen_zeit=NULL`)

**Response:** `{ success: true }`

### 5.5 Routing & Sicherheit

- Alle drei neuen Endpunkte in `tagesstempelRoutes.js` mit `generalLimiter`, keine Auth (konsistent mit `/kommen` und `/gehen`).
- WebSocket-Events in Punkt-Notation: `tagesstempel.nachgestempelt`, `tagesstempel.nachgefragt`.

---

## 6. Tablet-Dialog-Flow

### 6.1 Auslöser

In `electron-intern-tablet/index.html`, Funktion `tagesstempelKommen(personId, typ)` (aktuell ~Zeile 3051). Nach erfolgreichem `POST /tagesstempel/kommen`:

```js
const check = await ApiService.get(`/tagesstempel/nachstempel-check?${typ}_id=${personId}`);
if (check.nachstempel_noetig) {
  await showNachstempelDialog(check);
}
```

Kommen-Stempel wird **nie blockiert**. Fehler beim Check werden stillschweigend geloggt.

### 6.2 Dialog-Varianten

**Gelber Tag (nur Mittag fehlt):**
```
Nachstempelung für gestern (Do., 23.04.2026)
Max Mustermann

🍽  Hast du gestern Mittag gemacht?
    [   Ja   ]    [  Nein  ]

[Abbrechen]
```

**Oranger Tag (Gehen fehlt, ggf. Mittag fehlt):**
```
Nachstempelung für gestern (Do., 23.04.2026)
Max Mustermann

🕘  Wann bist du gestern Feierabend gegangen?
    [ 16:00 (laut Dienstplan) ]    [Andere Zeit: __:__]

🍽  Hast du gestern Mittag gemacht?    (nur wenn Mittag auch fehlt)
    [   Ja   ]    [  Nein  ]

[Abbrechen]    [Speichern]
```

**Roter Tag (nichts gestempelt) — zuerst:**
```
Gestern ist keine Zeit erfasst.
Warst du da?

[  Ja  ]    [  Nein, freier Tag  ]
```
- **Nein, freier Tag** → `POST /nachstempel` mit `antwort:'nicht_anwesend'`
- **Ja** → kombinierter Dialog mit Kommen + Gehen + Mittag, alle Defaults aus `arbeitszeiten_plan`

### 6.3 Interaktion

- **Zeit-Eingabe:** Tablet-Number-Pad-Stil wie in bestehenden Stempel-Dialogen
- **Gelb-Fall (nur Mittag fehlt):** Es gibt keinen Speichern-Button. [Ja] und [Nein] sind direkt die Speicher-Aktionen (Ein-Klick-Nachstempelung)
- **Orange/Rot-Fälle mit Zeit-Eingabe:** [Speichern] nur aktiv, wenn alle fehlenden Zeit-Felder ausgefüllt → `POST /nachstempel`
- **[Abbrechen] / Schließen / Außerhalb-Klick:** `POST /nachstempel/dismiss`, Dialog zu, Status bleibt
- **Mittag „Nein"** ist gültige Antwort — kein Pause-Eintrag, Ist-Zeit entsprechend höher

### 6.4 Was NICHT passiert

- Kein Re-Nag: einmal abgebrochen oder gespeichert → `nachgefragt_am` gesetzt → kommt nicht wieder
- Kein Dialog im Web-Frontend für Mitarbeiter
- Keine Mehrtages-Abfrage (ältere Lücken bleiben im Zeitkonto sichtbar, Chef trägt manuell nach)

---

## 7. Frontend Zeitkonto-Rendering

### 7.1 Status-Punkt in der Tageszeile

In `frontend/src/components/app.js`, Funktion `renderZeitkonto` (ab Zeile 31164). Neues `<td>` als erste Spalte der Tagestabelle mit Breite 18px:

```html
<td style="padding:3px 8px;text-align:center;">
  <span style="display:inline-block;width:12px;height:12px;border-radius:50%;
               background:${STATUS_FARBEN[t.status]};"
        title="${STATUS_TOOLTIP[t.status]}"></span>
</td>
```

Farbpalette:
```js
const STATUS_FARBEN = {
  gruen:  '#22c55e',
  gelb:   '#eab308',
  orange: '#f97316',
  rot:    '#ef4444',
  blau:   '#3b82f6'
};
const STATUS_TOOLTIP = {
  gruen:  'Alles gestempelt',
  gelb:   'Mittag fehlt',
  orange: 'Kommen oder Feierabend fehlt',
  rot:    'Nicht gestempelt',
  blau:   'Abwesenheit (Urlaub/Krank/Lehrgang)'
};
```

### 7.2 Farb-Legende oberhalb der Liste

Direkt sichtbar (nicht hinter Tooltip versteckt). Platzierung: zwischen Range-Buttons und `#zeitkontoContainer`. Einzeiliger Block mit Inline-Styles im Projekt-Muster.

```
🟢 Vollständig    🟡 Mittag fehlt    🟠 Kommen/Gehen fehlt
🔴 Nicht gestempelt    🔵 Urlaub/Krank/Lehrgang
```

### 7.3 Inline-Bearbeitungs-Panel

Klick auf Status-Punkt (`gelb | orange | rot`) öffnet direkt in der Tageszeile ein Panel mit:
- Kommen-Zeit-Input (default aus Dienstplan wenn leer)
- Gehen-Zeit-Input (default aus Dienstplan wenn leer)
- Checkbox „Ja, Mittag wurde gemacht"
- [Speichern] → `POST /api/tagesstempel/nachstempel` → Panel zu, Zeile neu rendern
- [Abbrechen] → Panel zu

Chef kann jederzeit editieren — auch nach `nachgefragt_am` gesetzt, auch für Tage die nicht der „letzte Soll-Tag" sind.

### 7.4 WebSocket-Handling

`handleWebSocketMessage`: neues Event `tagesstempel.nachgestempelt` → wenn Zeitkonto-Tab aktiv, `loadZeitkonto()` neu laden.

### 7.5 index.html-Integrität

Vor jedem Commit: `grep -c "data-tab=" frontend/index.html` prüft, dass alle 11 Tabs erhalten sind (CLAUDE.md §4 Fallstrick).

---

## 8. Fehlerbehandlung

### 8.1 Backend

| Fall | Verhalten |
|---|---|
| Fehlende Person-ID | HTTP 400 |
| Person nicht gefunden | HTTP 404 |
| Ungültiges Zeitformat | HTTP 400 (bestehende `ZEIT_RE`-Regex) |
| Letzter Soll-Tag > 30 Tage zurück | `nachstempel_noetig: false` |
| Tag schon `nachgefragt_am` gesetzt, erneuter `POST /nachstempel` | Erlaubt (Chef-Korrektur), `nachgefragt_am` überschrieben |
| Parallele Tablet-Requests für dieselbe Person | SQLite-Write-Lock sorgt für Reihenfolge; der zweite sieht `nachgefragt_am` und macht nichts |
| Migration fehlschlägt (Spalte existiert) | `safeRun`-Helper + `IF NOT EXISTS`-Pattern wie in bestehenden Migrationen |

### 8.2 Frontend / Tablet

| Fall | Verhalten |
|---|---|
| `/nachstempel-check` 5xx | Console-Log, kein Dialog, Kommen bleibt gültig |
| `/nachstempel` 5xx beim Speichern | Toast rot „Speichern fehlgeschlagen", Dialog bleibt offen |
| WebSocket-Event während offener Dialog | Dialog nicht schließen, Daten im Hintergrund updaten |
| Unbekannter `status`-Wert | Fallback `kein_punkt` (kein Punkt) |

---

## 9. Tests

### 9.1 Automatisiert — neue Datei `backend/tests/nachstempel.test.js`

1. **Grüner Tag:** Kommen + Gehen + Mittag → `/zeitkonto` liefert `status:'gruen'`; `/nachstempel-check` → `nachstempel_noetig:false`
2. **Gelber Tag** (nur Mittag fehlt)
3. **Oranger Tag** (Gehen fehlt) + Defaults-Felder korrekt
4. **Roter Tag** (nichts gestempelt)
5. **Blauer Tag** (Urlaub)
6. **`POST /nachstempel` vollständig** — legt `tagesstempel` + `pause_tracking` an, setzt `nachgefragt_am`
7. **`POST /nachstempel` mit `mittag_gemacht:false`** — kein Pause-Eintrag
8. **`POST /nachstempel` roter Tag `nicht_anwesend`** — Platzhalter angelegt, keine Zeiten
9. **`POST /nachstempel/dismiss`** — nur `nachgefragt_am` gesetzt
10. **Pause-Start-Kappung:** Mitarbeiter geht 11:30, `mittagspause_start=12:00`, `mittag_gemacht:true` → Pause endet ≤ 11:30
11. **Re-Nag-Schutz:** Nach `nachgefragt_am` liefert `/nachstempel-check` `false`
12. **Letzter-Soll-Tag-Logik:** Am Montag wird Freitag gefunden (Samstag/Sonntag übersprungen)

### 9.2 Manuelle Checkliste nach Deploy

1. Mitarbeiter stempelt Kommen → kein Dialog (gestern war grün)
2. Chef löscht gestrigen Gehen → Mitarbeiter stempelt morgen → Dialog mit Gehen-Default aus Dienstplan
3. Speichern → Zeitkonto zeigt grün, Saldo neu berechnet
4. Abbrechen → Zeitkonto weiter orange, kein Re-Nag am nächsten Tag
5. Chef setzt für gestern nichts → Mitarbeiter kommt → Dialog „Warst du da?" → Nein → roter Tag bleibt, kein Re-Nag
6. Zeitkonto: Klick auf gelben Punkt → Inline-Panel öffnet → Mittag nachtragen → grün
7. Legende oberhalb des Zeitkontos sichtbar
8. WebSocket: Tablet A antwortet, Web-Zeitkonto aktualisiert sich ohne Reload
9. `grep -c "data-tab=" frontend/index.html` — kein Tab-Verlust

---

## 10. Rollout

1. `npm test` lokal grün (Migration 036 inklusive)
2. Backend + Frontend deployen (Workflow in `CLAUDE.md §5`)
3. Migration 036 läuft beim Serverstart automatisch, initialisiert `nachgefragt_am = erstellt_am` für Bestand
4. Tablet-App-Version in `electron-intern-tablet/package.json` hochzählen, Build + Installer nach `/opt/werkstatt-terminplaner/backend/tablet-updates/` hochladen, Update registrieren (`POST /api/tablet-update/register`)
5. Werkstatt-Tablets fordern Update an und installieren — ab Folgetag läuft die Nachstempel-Logik

---

## 11. Offene Punkte nach Implementierung

- Beobachten ob 30-Tage-Limit für Nachstempel-Check richtig ist (evtl. auf 14 Tage reduzieren nach 2 Wochen Betrieb)
- Überlegen ob eine Monats-Zusammenfassung ("5× gelb, 2× rot") im Zeitkonto sinnvoll wird, sobald das Feature läuft
- **Erweiterung: Auftragsnummer bei Überstunden**: Wenn der Nachstempel-Dialog eine Gehen-Zeit größer als das geplante `arbeitszeit_ende` einträgt (oder Kommen früher als `arbeitszeit_start`), zusätzlich abfragen "An welcher internen Auftragsnummer hast du länger gearbeitet?" für Chef-Nachvollziehbarkeit. Offene Designentscheidungen: Schwellwert (jede Minute / ab 15 Min?), Eingabe-Form (Dropdown der gestrigen Termine vs. Freitext), Mehrfachzuordnung bei mehreren Aufträgen, Speicherort (neue Spalte vs. neue Tabelle), Sichtbarkeit im Zeitkonto. Erst nach Live-Test der Grundfunktion entscheiden.
