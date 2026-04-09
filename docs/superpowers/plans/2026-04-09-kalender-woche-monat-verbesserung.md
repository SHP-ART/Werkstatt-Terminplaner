# Kalender Woche/Monat Verbesserung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wochenansicht und Monatsansicht bekommen Mitarbeiter-Auslastung und Abwesenheiten in den Headern/Zellen, plus 7-Spalten-Bugfix.

**Architecture:** Bestehende Methoden `loadKalenderWoche()` und `loadKalenderMonat()` in `app.js` werden erweitert um zusätzliche Datenquellen (`AuslastungService.getByDatum()`, `kalenderLadeAbwesenheiten()`). HTML-Rendering der Header/Zellen wird angepasst. Neue CSS-Klassen in `style.css`.

**Tech Stack:** Vanilla JavaScript, CSS Grid, bestehende `AuslastungService` API

---

## File Structure

| Datei | Aktion | Verantwortung |
|-------|--------|---------------|
| `frontend/src/styles/style.css` | Modify (Zeile 15411, plus neue Klassen) | Grid-Fix, neue Auslastungs-/Abwesenheits-Styles |
| `frontend/src/components/app.js` | Modify (`loadKalenderWoche` Zeile 33768, `loadKalenderMonat` Zeile 33992) | Daten laden, Header/Zellen-HTML erweitern |

---

### Task 1: CSS — 7-Spalten-Bugfix Wochenansicht

**Files:**
- Modify: `frontend/src/styles/style.css:15409-15413`

- [ ] **Step 1: Fix grid-template-columns von 6 auf 7**

In `frontend/src/styles/style.css`, Zeile 15411 ändern:

```css
/* Vorher: */
.kalender-wochen-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    min-height: 500px;
}

/* Nachher: */
.kalender-wochen-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    min-height: 500px;
}
```

- [ ] **Step 2: Manuell testen**

Im Browser Kalender → Woche öffnen. Alle 7 Tage (Mo–So) müssen gleichbreit sichtbar sein. Samstag darf nicht mehr abgeschnitten sein.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/style.css
git commit -m "fix: Kalender Wochenansicht 7-Spalten-Grid (war 6)"
```

---

### Task 2: CSS — Neue Klassen für Wochen-Header Auslastung & Abwesenheiten

**Files:**
- Modify: `frontend/src/styles/style.css` (nach Zeile 15472, nach `.kalender-wochen-tag-header .wt-count`)

- [ ] **Step 1: CSS-Klassen für Auslastungsbalken im Wochen-Header hinzufügen**

Nach dem bestehenden `.kalender-wochen-tag-header .wt-count { ... }` Block (Zeile 15467-15472) einfügen:

```css
/* Woche: Auslastungsbalken im Header */
.kwt-auslastung {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    padding: 0 8px;
}

.kwt-auslastung-track {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.25);
    overflow: hidden;
}

.kwt-auslastung-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s;
}

.kwt-auslastung-pct {
    font-size: 0.7em;
    opacity: 0.9;
    min-width: 28px;
    text-align: right;
}

/* Woche: Abwesenheiten im Header */
.kwt-abw {
    font-size: 0.68em;
    opacity: 0.85;
    padding: 2px 8px 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/style.css
git commit -m "style: add CSS for Wochen-Header Auslastung and Abwesenheiten"
```

---

### Task 3: JS — Wochenansicht Auslastungsdaten laden

**Files:**
- Modify: `frontend/src/components/app.js:33780-33783`

- [ ] **Step 1: AuslastungService-Calls zum Promise.all hinzufügen**

In `loadKalenderWoche()`, Zeile 33780-33783 ändern von:

```javascript
    const [termine, abwesenheiten] = await Promise.all([
      this.kalenderLadeTermine(datumVon, datumBis),
      this.kalenderLadeAbwesenheiten(datumVon, datumBis)
    ]);
```

zu:

```javascript
    const [termine, abwesenheiten, ...auslastungen] = await Promise.all([
      this.kalenderLadeTermine(datumVon, datumBis),
      this.kalenderLadeAbwesenheiten(datumVon, datumBis),
      ...tage.map(d => AuslastungService.getByDatum(this.kalenderFormatDatum(d)).catch(() => null))
    ]);

    // Auslastungen nach Datum mappen
    const auslastungProTag = {};
    tage.forEach((d, i) => {
      auslastungProTag[this.kalenderFormatDatum(d)] = auslastungen[i];
    });
```

- [ ] **Step 2: Manuell testen**

Browser öffnen, Kalender → Woche. In der Browser-Konsole prüfen, dass keine Fehler erscheinen. Die Seite muss weiterhin laden (noch keine sichtbare Änderung).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: load Auslastung per day in Wochenansicht"
```

---

### Task 4: JS — Wochen-Header mit Auslastung & Abwesenheiten rendern

**Files:**
- Modify: `frontend/src/components/app.js:33820-33843`

- [ ] **Step 1: Abwesenheiten-Rendering und Header-HTML ersetzen**

In `loadKalenderWoche()`, den Block von Zeile 33820 bis 33843 (von `// Abwesenheiten-Anzeige` bis zum Ende des `return` Strings) ersetzen durch:

```javascript
      // Auslastung für diesen Tag
      const tageAuslastung = auslastungProTag[datumStr];
      const auslastungProzent = tageAuslastung?.auslastung_prozent || 0;
      const auslastungFarbe = auslastungProzent < 50 ? '#4caf50' : auslastungProzent < 75 ? '#ffc107' : auslastungProzent < 90 ? '#ff9800' : '#f44336';

      // Abwesenheiten kompakt für Header
      const abwesendIcons = { Urlaub: '🏖️', Krank: '🤒', Berufsschule: '🏫', Lehrgang: '📚' };
      let abwHeaderHtml = '';
      if (tageAbw.length > 0) {
        const abwKurz = tageAbw.map(a => {
          const icon = abwesendIcons[a.grund] || '📋';
          const kuerzel = (a.person_name || '').split(' ').map(w => w[0]).join('');
          return `${icon}${kuerzel}`;
        }).join(' ');
        abwHeaderHtml = `<div class="kwt-abw">${abwKurz}</div>`;
      }

      const istVergangen = datumStr < new Date().toISOString().split('T')[0] && !istHeute;

      return `
        <div class="kalender-wochen-tag${istHeute ? ' ist-heute' : ''}${istVergangen ? ' ist-vergangen' : ''}">
          <div class="kalender-wochen-tag-header${istHeute ? ' ist-heute' : ''}${istVergangen ? ' ist-vergangen' : ''}" data-datum="${datumStr}">
            <span class="wt-name">${wt[i]}</span>
            <span class="wt-datum">${tag.getDate()}.${tag.getMonth()+1}.</span>
            <span class="wt-count">${tageTermine.length} Termin${tageTermine.length !== 1 ? 'e' : ''}</span>
            <div class="kwt-auslastung">
              <div class="kwt-auslastung-track">
                <div class="kwt-auslastung-fill" style="width:${Math.min(auslastungProzent, 100)}%;background:${auslastungFarbe};"></div>
              </div>
              <span class="kwt-auslastung-pct">${auslastungProzent}%</span>
            </div>
            ${abwHeaderHtml}
          </div>
          <div class="kalender-wochen-tag-body ${isZeitleiste ? 'zeitleiste-modus' : 'listen-modus'}">
            ${bodyContent}
          </div>
          <div class="kalender-wochen-tag-footer">
            <button class="kalender-woche-neu-btn" data-datum="${datumStr}">+ Termin</button>
          </div>
        </div>
      `;
```

Beachte: Die alten `abwHtml`-Blöcke (Zeile 33821-33824) und `${abwHtml}` in Zeile 33835 werden komplett ersetzt. Abwesenheiten sind jetzt im Header statt darunter.

- [ ] **Step 2: Manuell testen**

Browser → Kalender → Woche:
- Jeder Spaltenheader zeigt einen kleinen Auslastungsbalken mit Prozentanzeige
- Abwesende MA erscheinen als kompakte Icons+Kürzel im Header
- Tage ohne Abwesenheiten zeigen nur den Balken
- Keine Konsolen-Fehler

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: Wochen-Header mit Auslastungsbalken und Abwesenheiten"
```

---

### Task 5: CSS — Neue Klasse für Monats-Abwesenheiten

**Files:**
- Modify: `frontend/src/styles/style.css` (nach dem `.mz-auslastung-bar` Block, ca. Zeile 15795)

- [ ] **Step 1: CSS-Klasse für Abwesenheiten in Monatszellen hinzufügen**

Nach dem bestehenden `.kalender-monat-zelle .mz-auslastung-bar { ... }` Block (Zeile 15791-15795) einfügen:

```css
/* Monat: Abwesenheiten in Zelle */
.mz-abwesenheiten {
    font-size: 0.65em;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
    line-height: 1.3;
}

.kalender-monat-zelle.ist-vergangen .mz-abwesenheiten {
    opacity: 0.5;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/style.css
git commit -m "style: add CSS for Monats-Abwesenheiten"
```

---

### Task 6: JS — Monatsansicht Abwesenheiten laden und anzeigen

**Files:**
- Modify: `frontend/src/components/app.js:34012-34054`

- [ ] **Step 1: Abwesenheiten parallel laden**

In `loadKalenderMonat()`, Zeile 34012 ändern von:

```javascript
    const termine = await this.kalenderLadeTermine(datumVon, datumBis);
```

zu:

```javascript
    const [termine, abwesenheiten] = await Promise.all([
      this.kalenderLadeTermine(datumVon, datumBis),
      this.kalenderLadeAbwesenheiten(datumVon, datumBis)
    ]);

    // Abwesenheiten nach Datum gruppieren
    const abwProTag = {};
    abwesenheiten.forEach(a => {
      if (!abwProTag[a.datum]) abwProTag[a.datum] = [];
      abwProTag[a.datum].push(a);
    });
```

- [ ] **Step 2: Farbskala an Wochenansicht angleichen**

In `loadKalenderMonat()`, Zeile 34035 ändern von:

```javascript
      const auslastungFarbe = auslastungProzent < 50 ? '#28a745' : auslastungProzent < 75 ? '#ffc107' : auslastungProzent < 90 ? '#ff9800' : '#dc3545';
```

zu:

```javascript
      const auslastungFarbe = auslastungProzent < 50 ? '#4caf50' : auslastungProzent < 75 ? '#ffc107' : auslastungProzent < 90 ? '#ff9800' : '#f44336';
```

- [ ] **Step 3: Abwesenheitszeile in Zellen-HTML einfügen**

In `loadKalenderMonat()`, innerhalb der `while`-Schleife (nach Zeile 34044, vor dem `html += ...`), Abwesenheits-HTML berechnen und in die Zelle einfügen.

Die Berechnung vor dem `html +=` einfügen:

```javascript
      // Abwesenheiten für diesen Tag
      const tageAbw = abwProTag[datumStr] || [];
      const abwesendIcons = { Urlaub: '🏖️', Krank: '🤒', Berufsschule: '🏫', Lehrgang: '📚' };
      let abwHtml = '';
      if (tageAbw.length > 0) {
        const abwKurz = tageAbw.map(a => {
          const icon = abwesendIcons[a.grund] || '📋';
          const kuerzel = (a.person_name || '').split(' ').map(w => w[0]).join('');
          return `${icon}${kuerzel}`;
        }).join(' ');
        abwHtml = `<div class="mz-abwesenheiten">${abwKurz}</div>`;
      }
```

Dann das Zellen-HTML (Zeile 34046-34054) ersetzen durch:

```javascript
      html += `
        <div class="kalender-monat-zelle${istHeute ? ' ist-heute' : ''}${!istAktuellerMonat ? ' anderer-monat' : ''}${istVergangen ? ' ist-vergangen' : ''}" data-datum="${datumStr}">
          <div class="mz-datum">
            <span class="mz-tag">${cursor.getDate()}</span>
            <button class="mz-neu-btn" data-datum="${datumStr}" title="Neuer Termin">+</button>
          </div>
          ${abwHtml}
          ${tageTermine.length > 0 ? `<div class="mz-auslastung"><div class="mz-auslastung-bar" style="width:${auslastungProzent}%;background:${auslastungFarbe}"></div></div>` : ''}
          <div class="mz-termine">${miniTermine}${mehrAnzahl}</div>
        </div>
      `;
```

- [ ] **Step 4: Manuell testen**

Browser → Kalender → Monat:
- Abwesende MA erscheinen als Icons+Kürzel unter dem Datum in jeder Zelle
- Farbskala der Auslastungsbalken ist konsistent mit der Wochenansicht
- Tage ohne Abwesenheiten zeigen keine Abwesenheitszeile
- Keine Konsolen-Fehler

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: Monatsansicht mit Abwesenheiten und konsistenter Farbskala"
```

---

### Task 7: Finaler Test & Commit

- [ ] **Step 1: Wochenansicht komplett testen**

Browser → Kalender → Woche:
- 7 gleichbreite Spalten (Mo–So, inkl. Samstag)
- Jeder Header zeigt Auslastungsbalken mit % und ggf. Abwesenheiten
- Zeitleiste-Modus funktioniert
- Listen-Modus funktioniert
- Klick auf Header wechselt zur Tagesansicht
- "+ Termin" Button funktioniert
- Vergangene Tage sind ausgegraut

- [ ] **Step 2: Monatsansicht komplett testen**

Browser → Kalender → Monat:
- Abwesenheiten pro Tag sichtbar
- Auslastungsbalken mit konsistenter Farbskala
- Klick auf Zelle wechselt zur Tagesansicht
- "+" Button erstellt neuen Termin
- Vergangene Tage ausgegraut
- Andere-Monat-Tage gedimmt

- [ ] **Step 3: Tagesansicht Regressionstest**

Browser → Kalender → Tag:
- MA-Auslastungskarten funktionieren weiterhin
- Keine Seiteneffekte durch die Änderungen
