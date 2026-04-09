# Kalender Wochenansicht & Monatsansicht — Verbesserung

**Datum:** 2026-04-09
**Gewählter Ansatz:** B (Kompakte Info-Header) für beide Views

## Zusammenfassung

Die Wochenansicht und Monatsansicht im Kalender bekommen Mitarbeiter-Auslastung und Abwesenheiten direkt in den bestehenden UI-Elementen (Spaltenheader bzw. Tageszellen). Zusätzlich wird der 6-Spalten-Bug in der Wochenansicht gefixt. Kein neues Layout, keine neuen Panels — nur gezielte Erweiterung der bestehenden Struktur.

## Probleme (Ist-Zustand)

1. **Woche: 6-Spalten-Bug** — CSS `grid-template-columns: repeat(6, 1fr)` schneidet Samstag ab (Werkstatt arbeitet Sa)
2. **Woche: Keine MA-Auslastung** — Tagesansicht hat Auslastungskarten, Wochenansicht nicht
3. **Woche: Abwesenheiten schlecht sichtbar** — Nur als große Bars unter dem Header, nicht im Header integriert
4. **Monat: Keine Abwesenheiten** — `kalenderLadeAbwesenheiten()` wird gar nicht aufgerufen
5. **Monat: Vereinfachte Auslastung** — Berechnet nur `geschaetzte_zeit / 480 * 100` statt echte MA-Auslastung

## 1. Bugfix: 7-Spalten-Grid (Woche)

**Datei:** `frontend/src/styles/style.css` Zeile 15411

Änderung:
```css
/* vorher */
.kalender-wochen-grid { grid-template-columns: repeat(6, 1fr); }

/* nachher */
.kalender-wochen-grid { grid-template-columns: repeat(7, 1fr); }
```

## 2. Wochenansicht — Kompakte Info-Header

### Daten laden

**Datei:** `frontend/src/components/app.js`, Methode `loadKalenderWoche()` (Zeile 33768)

Im bestehenden `Promise.all` (Zeile 33780) zusätzlich `AuslastungService.getByDatum()` für jeden der 7 Tage laden:

```javascript
const [termine, abwesenheiten, ...auslastungen] = await Promise.all([
  this.kalenderLadeTermine(datumVon, datumBis),
  this.kalenderLadeAbwesenheiten(datumVon, datumBis),
  ...tage.map(d => AuslastungService.getByDatum(this.kalenderFormatDatum(d)).catch(() => null))
]);
```

Auslastungen als Map aufbauen: `auslastungProTag[datumStr] = auslastungen[i]`

### Header erweitern

Jeder Spaltenheader (`.kalender-wochen-tag-header`) bekommt zwei neue Elemente:

**a) Mini-Auslastungsbalken** — 4px hoher Balken unter der Termin-Anzahl:
- Farbskala: grün (< 50%), gelb (50-75%), orange (75-90%), rot (> 90%)
- Prozentanzeige rechts daneben
- Daten aus `auslastungProTag[datumStr].auslastung_prozent`

**b) Abwesenheits-Kompaktzeile** — kleine Icons + Kürzel im Header:
- Format: `🏖️MK 🤒TH` (Icon + Kürzel, platzsparend)
- Nur angezeigt wenn Abwesenheiten vorhanden
- Ersetzt die bisherigen großen `kalender-abwesenheit-bar` Blöcke (Zeile 33821-33824)

### Header-HTML (Zielstruktur)

```html
<div class="kalender-wochen-tag-header">
  <span class="wt-name">MO</span>
  <span class="wt-datum">14.4.</span>
  <span class="wt-count">5 Termine</span>
  <div class="kwt-auslastung">
    <div class="kwt-auslastung-bar" style="width:72%;background:#ffc107;"></div>
    <span class="kwt-auslastung-pct">72%</span>
  </div>
  <div class="kwt-abw">🏖️MK 🤒TH</div>
</div>
```

### Neue CSS-Klassen

```css
.kwt-auslastung {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    padding: 0 6px;
}

.kwt-auslastung-bar {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: #e0e0e0;
    overflow: hidden;
    position: relative;
}

/* Inner fill via inline style width + background */

.kwt-auslastung-pct {
    font-size: 0.7em;
    opacity: 0.9;
    min-width: 28px;
    text-align: right;
}

.kwt-abw {
    font-size: 0.68em;
    opacity: 0.85;
    padding: 2px 6px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

## 3. Monatsansicht — Auslastungsbalken + Abwesenheits-Leiste

### Daten laden

**Datei:** `frontend/src/components/app.js`, Methode `loadKalenderMonat()` (Zeile 33992)

Zwei neue Datenabrufe parallel zu den Terminen:

```javascript
const [termine, abwesenheiten] = await Promise.all([
  this.kalenderLadeTermine(datumVon, datumBis),
  this.kalenderLadeAbwesenheiten(datumVon, datumBis)
]);
```

Abwesenheiten nach Datum gruppieren (wie in Wochenansicht).

### Auslastung verbessern

Die vereinfachte Berechnung (Zeile 34033-34034) durch `AuslastungService.getByDatum()` ersetzen wäre ideal, erzeugt aber potenziell 30+ API-Calls pro Monatsansicht. Pragmatischer Ansatz:

- Die bestehende Minutenberechnung beibehalten (ist für die Monatsübersicht ausreichend genau)
- Farbskala an die Wochenansicht angleichen für Konsistenz

### Abwesenheits-Zeile pro Zelle

Unter dem Datum-Header jeder Zelle eine kompakte Abwesenheitszeile:

```html
<div class="kalender-monat-zelle">
  <div class="mz-datum">
    <span class="mz-tag">14</span>
    <button class="mz-neu-btn">+</button>
  </div>
  <div class="mz-abwesenheiten">🏖️MK 🤒TH</div>
  <div class="mz-auslastung">...</div>
  <div class="mz-termine">...</div>
</div>
```

### Neue CSS-Klasse

```css
.mz-abwesenheiten {
    font-size: 0.65em;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
    line-height: 1.3;
}
```

## 4. Visuelles Polish

- Woche-Header: Leichter Gradient für mehr Tiefe
- Auslastungsbalken: Konsistente Farbskala in beiden Views (grün → gelb → orange → rot)
- Abwesenheits-Icons: Einheitliche Darstellung (Emoji + Kürzel)

## Nicht im Scope

- Keine neuen Panels oder Sidebars
- Keine neuen Modals
- Kein Umbau der Zeitleiste/Liste-Modi
- Keine Änderung der Tages- oder Jahresansicht
- Kein neuer API-Endpoint (bestehende Services reichen aus)

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `frontend/src/styles/style.css` | Grid-Fix 6→7, neue CSS-Klassen für Auslastung/Abwesenheit |
| `frontend/src/components/app.js` | `loadKalenderWoche()` erweitern, `loadKalenderMonat()` erweitern |
