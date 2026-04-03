# Design: Intern-Tab Gleichstellung mit Tablet-App

**Datum:** 2026-04-03  
**Status:** Approved  
**Ansatz:** A – Tablet-Code kopieren & adaptieren

---

## Ziel

Den "Intern"-Tab im Haupt-Frontend (`frontend/src/components/app.js`) funktional und optisch auf den Stand der Tablet-App (`electron-intern-tablet/index.html`) bringen. Beide Oberflächen sollen dieselben Aktionen ermöglichen.

---

## Was fehlt (Ist-Zustand)

| Feature | Frontend Intern-Tab | Tablet-App |
|---|---|---|
| ▶️ Starten-Button | ❌ fehlt | ✅ vorhanden |
| ✓ Fertig-Button | ❌ fehlt | ✅ vorhanden |
| 🍽️ Mittagspause-Button (aktiv starten) | ❌ fehlt | ✅ vorhanden |
| ✓ Fertig je Einzelarbeit | ❌ nur Anzeige | ✅ mit Button |
| Arbeitspause-Grund im Badge | ❌ nur "Pausiert" | ✅ "Pausiert – Teil fehlt" |
| 📅 Verschoben / ⚠️ Verspätet-Badges | ❌ fehlt | ✅ vorhanden |
| Interne Auftragsnummer in Kachel | ❌ fehlt | ✅ vorhanden |
| 🧹 Werkstatt-Reinigung (Lehrling leer) | ❌ "Keine Aufträge" | ✅ vorhanden |
| Auto-Pause blockiert keine Buttons | ❌ blockiert alles | ✅ nur manuelle Pause |

---

## Betroffene Dateien

| Datei | Änderungstyp |
|---|---|
| `frontend/src/components/app.js` | Erweitern: neue Methoden + `renderInternPersonKachel` überarbeiten |
| `frontend/src/styles/style.css` | Erweitern: neue CSS-Klassen für Buttons und Badges |

---

## Implementierungsdetails

### 1. `loadInternTeamUebersicht()` erweitern

Zusätzlich zu den bestehenden API-Aufrufen folgende parallel laden:
- `ApiService.get('/pause/aktive').catch(() => [])` → aktive Mittagspausen
- `ApiService.get('/pause/heute').catch(() => [])` → heute bereits abgeschlossene Pausen

Ergebnis: `pause_tracking_aktiv`, `pause_verbleibende_minuten`, `pause_bereits_gemacht` werden in Person-Objekte eingetragen (analog Tablet `loadTeamUebersicht()`).

### 2. Neue Hilfsfunktionen in `app.js`

#### `internGetArbeitenFromTermin(termin)`
Kopie von Tablet `getArbeitenFromTermin()`. Parst `arbeitszeiten_details` JSON, liefert Array mit `{ name, zeit, abgeschlossen }`.

#### `internRenderArbeitenKompakt(termin)`
Kopie von Tablet `renderArbeitenKompakt()`. Rendert kompakte ✅/• Liste für "Nächster Auftrag" Preview.

#### `internRenderArbeitenListe(termin, personId, typ)`
Kopie von Tablet `renderArbeitenListe()`. Rendert vollständige Arbeitenliste mit "✓ Fertig"-Button je Einzelarbeit. Button ruft `app.internBeendenEinzelarbeit()` auf.

### 3. Neue App-Methoden

#### `async internStarten(terminId, kundeName)`
- Bestätigungs-Confirm: "Auftrag für [Kunde] starten?"
- POST `/termine/:id/starten`
- Reload via `this.loadInternTeamUebersicht()`

#### `async internBeenden(terminId, kundeName)`
- Bestätigungs-Confirm: "Auftrag für [Kunde] als fertig markieren?"
- POST `/termine/:id/beenden`
- Reload via `this.loadInternTeamUebersicht()`

#### `async internBeendenEinzelarbeit(terminId, arbeitIndex, btn)`
- Doppelklick-Schutz via `btn.disabled = true`
- POST `/termine/:id/arbeit-beenden` mit `{ arbeit_index: arbeitIndex }`
- Reload via `this.loadInternTeamUebersicht()`

#### `async internPauseStarten(personId, personTyp, datum, imZeitfenster)`
- Analog Tablet `handlePauseStarten()`: Confirm wenn außerhalb Zeitfenster
- POST `/pause/starten` mit `{ personId, personTyp, datum }`
- Reload via `this.loadInternTeamUebersicht()`

### 4. `renderInternPersonKachel()` überarbeiten

**Badge-Verbesserung:**
- Bei `istArbeitPausiert`: Grund aus `aktiveArbeitspause.grund` im Badge anzeigen (analog Tablet Zeile ~1994)

**Auto-Pause nicht mehr sperren:**
- `kannStarten`, `kannBeenden`, `zeigeArbeitszeit`: statt `!inPause` → `!person.pause_tracking_aktiv`
- Body-Content `else if (inPause)`: nur zeigen wenn `person.pause_tracking_aktiv` (manuelle Pause)

**Aktuellem Auftrag – neue Elemente:**
- `istVerschoben` / `istVerspaetet` berechnen (analog Tablet ~2060–2070)
- Badges `badge-verschoben` / `badge-verspaetet` in `.auftrag-info` 
- Interne Auftragsnummer anzeigen: `<span class="auftrag-interne-nr">· [nr]</span>`
- `internRenderArbeitenListe()` statt bisheriger Bullet-Liste (wenn mehrere Arbeiten)
- Arbeitspause-Grund im Badge

**Buttons im Kachel-Header (neu):**

```html
<div class="intern-kachel-buttons">
  <!-- Starten / Fertig / deaktiviert (analog tablet-btn-confirm / tablet-btn-complete) -->
  <button class="intern-btn-starten" onclick="app.internStarten(...)">▶️ Starten</button>
  <!-- oder -->
  <button class="intern-btn-fertig" onclick="app.internBeenden(...)">✓ Fertig</button>
  
  <!-- Mittagspause (analog tablet-btn-pause) -->
  <button class="intern-btn-mittagspause" onclick="app.internPauseStarten(...)">🍽️ Pause</button>
</div>
```

Logik identisch zur Tablet-App:
- `manuellePauseAktiv = !!person.pause_tracking_aktiv`
- `kannStarten`: Status `geplant/offen/wartend` + nicht manuelle Pause + nicht Berufsschule + nicht abwesend
- `kannBeenden`: Status `in_arbeit` + keine mehreren Arbeiten + nicht manuelle Pause + ...
- `alleArbeitenAbgeschlossen`: alle Einzelarbeiten `.abgeschlossen === true`
- Mittagspause: 4 Zustände (aktiv-laufend / bereits-gemacht / im-Zeitfenster / deaktiviert)

**Leer-Zustand Lehrling:**
- `isLehrling`: Icon `🧹`, Text "Werkstatt-Reinigung"
- Sonst: Icon `🎉`, Text "Keine Aufträge für heute"

**Nächster Auftrag:**
- Interne Auftragsnummer anzeigen (Ergänzung)
- `internRenderArbeitenKompakt()` statt bisheriger einfacher Arbeit-Anzeige

### 5. CSS in `style.css` (Ergänzungen)

```css
/* Kachel-Header-Buttons (Starten/Fertig/Pause) */
.intern-kachel-buttons { ... }
.intern-btn-starten { ... }   /* grün, analog tablet-btn-confirm */
.intern-btn-fertig { ... }    /* grün, analog tablet-btn-complete */
.intern-btn-mittagspause { ... } /* blau/grau, analog tablet-btn-pause */
.intern-btn-mittagspause.aktiv { ... }
.intern-btn-mittagspause.ausserhalb { ... }

/* Badges */
.badge-verschoben { background: #f39c12; ... }
.badge-verspaetet { background: #e74c3e; ... }

/* Interne Auftragsnummer */
.auftrag-interne-nr { font-size: 0.85em; color: var(--text-secondary); }

/* Einzelarbeiten-Liste (analog .arbeiten-liste im Tablet) */
.intern-arbeiten-liste { ... }
.intern-arbeit-item { ... }
.intern-btn-einzelarbeit-fertig { ... }
```

---

## Nicht geändert

- Backend: keine Änderungen nötig (alle API-Endpunkte bereits vorhanden)
- `electron-intern-tablet/index.html`: bleibt unverändert
- Bestehende Arbeitspause-Funktionen `interneArbeitPausieren()` / `interneArbeitFortsetzen()`: bleiben unverändert

---

## Testpfade nach Implementierung

1. Termin mit Status `geplant` → Starten-Button erscheint → klicken → Status wechselt auf `in_arbeit`
2. Termin `in_arbeit` (einzelne Arbeit) → Fertig-Button erscheint → klicken → Termin abgeschlossen
3. Termin `in_arbeit` (mehrere Arbeiten) → Einzelarbeiten-Buttons erscheinen → jede abschließen → globaler Fertig-Button erscheint
4. Mittagspause: im Zeitfenster ±1h → Button aktiv → klicken → Badge "🍽️ Pause", Buttons gesperrt
5. Mittagspause: bereits gemacht → Button deaktiviert mit "✓ Pause erledigt"
6. Arbeitspause-Badge: Grund sichtbar ("⏸️ Pausiert – Teil fehlt")
7. Lehrling ohne Aufträge: zeigt "🧹 Werkstatt-Reinigung"
8. Auto-Pause (Zeitfenster, kein Klick): Badge "🍽️ Pause", aber alle Buttons bedienbar
