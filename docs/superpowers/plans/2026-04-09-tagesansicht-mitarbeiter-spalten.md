# Tagesansicht Mitarbeiter-Spalten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neuer dritter Ansichtsmodus "Mitarbeiter" in der Kalender-Tagesansicht, bei dem jeder MA/Lehrling eine eigene Zeitleisten-Spalte mit tatsächlichen Stempelzeiten bekommt.

**Architecture:** Neuer HTML-Container + Toggle-Button, neue Render-Methode `renderKalenderTagMitarbeiter()` in der App-Klasse, Grid-CSS für MA-Spalten. Daten kommen von bestehenden APIs (Termine, Auslastung, Abwesenheiten).

**Tech Stack:** Vanilla JavaScript, CSS Grid, bestehende AuslastungService/Termine-API

---

## File Structure

| Datei | Aktion | Verantwortung |
|-------|--------|---------------|
| `frontend/index.html` | Modify (Zeile 1451, 1483) | Dritter Toggle-Button, neuer Container |
| `frontend/src/styles/style.css` | Modify (neue Klassen nach Tagesansicht-Styles) | MA-Spalten Grid, Header, Spalten-Styles |
| `frontend/src/components/app.js` | Modify (`loadKalenderTag` Zeile 33667, neue Methode) | Toggle-Logik, neue `renderKalenderTagMitarbeiter()` |

---

### Task 1: HTML — Toggle-Button und Container hinzufügen

**Files:**
- Modify: `frontend/index.html:1451,1483`

- [ ] **Step 1: Dritten Toggle-Button einfügen**

In `frontend/index.html`, nach Zeile 1451 (dem Liste-Button) einen dritten Button einfügen:

```html
                        <button class="kalender-ansicht-btn active" data-ansicht="zeitleiste" title="Zeitleiste">🕐 Zeitleiste</button>
                        <button class="kalender-ansicht-btn" data-ansicht="liste" title="Liste">📋 Liste</button>
                        <button class="kalender-ansicht-btn" data-ansicht="mitarbeiter" title="Mitarbeiter">👥 Mitarbeiter</button>
```

Die erste Zeile existiert schon, die zweite auch — nur die dritte ist neu.

- [ ] **Step 2: Neuen Container für MA-Ansicht einfügen**

In `frontend/index.html`, nach Zeile 1483 (dem `kalenderTagListe` div) einen neuen Container einfügen:

```html
                    <div class="kalender-tag-zeitleiste" id="kalenderTagZeitleiste"></div>
                    <div class="kalender-tag-liste" id="kalenderTagListe" style="display:none;"></div>
                    <div class="kalender-tag-mitarbeiter" id="kalenderTagMitarbeiter" style="display:none;"></div>
```

Die ersten zwei Zeilen existieren schon — nur die dritte ist neu.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add Mitarbeiter toggle button and container in Tagesansicht"
```

---

### Task 2: CSS — MA-Spalten Grid und Styles

**Files:**
- Modify: `frontend/src/styles/style.css` (neue Klassen einfügen)

- [ ] **Step 1: CSS-Klassen für MA-Spalten-Layout hinzufügen**

Finde den Bereich der Kalender-Tag-Styles (nach den bestehenden `.kalender-tag-zeitleiste` und `.kalender-termin-block` Styles). Füge die neuen Klassen ein:

```css
/* ---- TAGESANSICHT: MITARBEITER-SPALTEN ---- */
.kalender-tag-ma-grid {
    display: flex;
    min-height: 550px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
}

.kalender-tag-ma-zeit-spalte {
    width: 50px;
    min-width: 50px;
    background: #f8f9fa;
    border-right: 1px solid #e5e7eb;
}

.kalender-tag-ma-zeit-spalte .ma-zeit-header {
    height: 56px;
    border-bottom: 1px solid #e5e7eb;
}

.kalender-tag-ma-zeit-spalte .ma-zeit-label {
    height: 50px;
    padding: 2px 6px;
    font-size: 0.7em;
    color: #999;
    border-bottom: 1px solid #f0f0f0;
}

.kalender-tag-ma-spalte {
    flex: 1;
    border-right: 1px solid #e5e7eb;
    position: relative;
}

.kalender-tag-ma-spalte:last-child {
    border-right: none;
}

.kalender-tag-ma-spalte-header {
    height: 56px;
    background: var(--steel);
    color: white;
    text-align: center;
    padding: 6px 8px;
    font-size: 0.82em;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.kalender-tag-ma-spalte-header .ma-name {
    font-weight: 700;
    font-size: 1em;
}

.kalender-tag-ma-spalte-header .ma-auslastung {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin-top: 2px;
}

.kalender-tag-ma-spalte-header .ma-auslastung-track {
    width: 50px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.25);
    overflow: hidden;
}

.kalender-tag-ma-spalte-header .ma-auslastung-fill {
    height: 100%;
    border-radius: 2px;
}

.kalender-tag-ma-spalte-header .ma-auslastung-pct {
    font-size: 0.8em;
    opacity: 0.9;
}

.kalender-tag-ma-spalte-header.abwesend {
    background: #95a5a6;
}

.kalender-tag-ma-spalte-header.nicht-zugewiesen {
    background: #7f8c8d;
}

.kalender-tag-ma-spalte-body {
    position: relative;
}

.kalender-tag-ma-spalte-body .ma-zeit-row {
    height: 50px;
    border-bottom: 1px solid #f0f0f0;
}

.kalender-tag-ma-termin {
    position: absolute;
    left: 3px;
    right: 3px;
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 0.75em;
    color: white;
    cursor: pointer;
    overflow: hidden;
    z-index: 2;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    transition: transform 0.1s, box-shadow 0.1s;
    line-height: 1.25;
}

.kalender-tag-ma-termin:hover {
    transform: scale(1.03);
    box-shadow: 0 3px 10px rgba(0,0,0,0.22);
    z-index: 10;
}

.kalender-tag-ma-termin .mat-titel {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.kalender-tag-ma-termin .mat-arbeit {
    opacity: 0.85;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.kalender-tag-ma-termin .mat-zeit {
    font-size: 0.9em;
    opacity: 0.75;
}

/* Reuse existing status colors */
.kalender-tag-ma-termin.status-geplant { background: linear-gradient(135deg, #ffc107, #e6ac00); color: #333; }
.kalender-tag-ma-termin.status-in_bearbeitung,
.kalender-tag-ma-termin.status-in-bearbeitung { background: linear-gradient(135deg, #17a2b8, #138496); }
.kalender-tag-ma-termin.status-abgeschlossen { background: linear-gradient(135deg, #28a745, #1f8a3a); }
.kalender-tag-ma-termin.status-offen { background: linear-gradient(135deg, #ffc107, #e0a800); color: #333; }
.kalender-tag-ma-termin.status-storniert { background: linear-gradient(135deg, #dc3545, #c82333); }
.kalender-tag-ma-termin.schwebend { border: 2px dashed #ff9800; background: #fff3e0; color: #e65100; }

/* Jetzt-Linie über alle Spalten */
.kalender-tag-ma-jetzt-linie {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: #f44336;
    z-index: 5;
    pointer-events: none;
}

.kalender-tag-ma-jetzt-linie::before {
    content: '';
    position: absolute;
    left: -4px;
    top: -3px;
    width: 8px;
    height: 8px;
    background: #f44336;
    border-radius: 50%;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/style.css
git commit -m "style: add CSS for Tagesansicht Mitarbeiter-Spalten"
```

---

### Task 3: JS — Toggle-Logik erweitern für dritten Modus

**Files:**
- Modify: `frontend/src/components/app.js:33667-33723`

- [ ] **Step 1: loadKalenderTag() um dritten Modus erweitern**

In `loadKalenderTag()`, den bestehenden Zeitleiste/Liste-Toggle-Block (ab Zeile 33711) ersetzen. Aktueller Code:

```javascript
    // Zeitleiste oder Liste rendern
    const zeitleisteEl = document.getElementById('kalenderTagZeitleiste');
    const listeEl = document.getElementById('kalenderTagListe');

    if (this.kalenderState.ansicht === 'zeitleiste') {
      if (zeitleisteEl) { zeitleisteEl.style.display = 'block'; }
      if (listeEl) { listeEl.style.display = 'none'; }
      this.renderKalenderTagZeitleiste(termine, zeitleisteEl);
    } else {
      if (zeitleisteEl) { zeitleisteEl.style.display = 'none'; }
      if (listeEl) { listeEl.style.display = 'block'; }
      this.renderKalenderTagListe(termine, listeEl, datumStr);
    }
```

Ersetzen durch:

```javascript
    // Zeitleiste, Liste oder Mitarbeiter rendern
    const zeitleisteEl = document.getElementById('kalenderTagZeitleiste');
    const listeEl = document.getElementById('kalenderTagListe');
    const maEl = document.getElementById('kalenderTagMitarbeiter');

    const ansicht = this.kalenderState.ansicht;
    if (zeitleisteEl) zeitleisteEl.style.display = ansicht === 'zeitleiste' ? 'block' : 'none';
    if (listeEl) listeEl.style.display = ansicht === 'liste' ? 'block' : 'none';
    if (maEl) maEl.style.display = ansicht === 'mitarbeiter' ? 'block' : 'none';

    if (ansicht === 'zeitleiste') {
      this.renderKalenderTagZeitleiste(termine, zeitleisteEl);
    } else if (ansicht === 'liste') {
      this.renderKalenderTagListe(termine, listeEl, datumStr);
    } else if (ansicht === 'mitarbeiter') {
      this.renderKalenderTagMitarbeiter(termine, maEl, datumStr, auslastung, abwesenheiten);
    }
```

Beachte: Die Methode `renderKalenderTagMitarbeiter` bekommt auch `auslastung` und `abwesenheiten` — diese müssen vorher verfügbar sein. Die Auslastungsdaten werden aktuell in einem separaten try/catch geladen (Zeile 33704-33708). Wir müssen die Variable `auslastung` im äußeren Scope speichern.

- [ ] **Step 2: Auslastungsdaten im äußeren Scope speichern**

Den bestehenden Auslastungs-Block (Zeile 33703-33709) ändern von:

```javascript
    // Mitarbeiter-Karten laden und rendern
    try {
      const auslastung = await AuslastungService.getByDatum(datumStr);
      this.renderKalenderTagMitarbeiterKarten(auslastung, datumStr);
    } catch (e) {
      console.warn('Mitarbeiter-Karten: Fehler beim Laden der Auslastung', e);
    }
```

zu:

```javascript
    // Mitarbeiter-Karten laden und rendern
    let auslastung = null;
    try {
      auslastung = await AuslastungService.getByDatum(datumStr);
      this.renderKalenderTagMitarbeiterKarten(auslastung, datumStr);
    } catch (e) {
      console.warn('Mitarbeiter-Karten: Fehler beim Laden der Auslastung', e);
    }
```

Dadurch ist `auslastung` im äußeren Scope für die MA-Ansicht verfügbar, und die Variable `abwesenheiten` (Zeile 33688) ist es bereits.

- [ ] **Step 3: Manuell testen**

Browser → Kalender → Tag. Dritter Button "👥 Mitarbeiter" sollte sichtbar sein. Klick darauf zeigt den leeren Container (noch keine Render-Methode). Zeitleiste und Liste funktionieren weiterhin.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: extend Tagesansicht toggle for Mitarbeiter mode"
```

---

### Task 4: JS — renderKalenderTagMitarbeiter() implementieren

**Files:**
- Modify: `frontend/src/components/app.js` (neue Methode nach `renderKalenderTagMitarbeiterKarten`)

- [ ] **Step 1: Neue Methode einfügen**

Nach der bestehenden Methode `renderKalenderTagMitarbeiterKarten()` (endet ca. Zeile 33782), die neue Methode einfügen:

```javascript
  /**
   * Tagesansicht: Mitarbeiter-Spalten mit Zeitleiste
   */
  renderKalenderTagMitarbeiter(termine, container, datumStr, auslastung, abwesenheiten) {
    if (!container) return;
    const startStunde = 7;
    const endStunde = 18;
    const slotHoehe = 50;

    // Spalten aus Auslastungsdaten aufbauen
    const spalten = [];
    if (auslastung) {
      (auslastung.mitarbeiter_auslastung || []).forEach(ma => {
        spalten.push({
          typ: 'mitarbeiter',
          id: ma.mitarbeiter_id || ma.id,
          name: ma.mitarbeiter_name || ma.name || '–',
          prozent: ma.ist_abwesend ? 0 : (ma.auslastung_prozent || 0),
          istAbwesend: ma.ist_abwesend === true,
          abwesenheitsTyp: ma.abwesenheits_typ || ''
        });
      });
      (auslastung.lehrlinge_auslastung || []).forEach(la => {
        spalten.push({
          typ: 'lehrling',
          id: la.lehrling_id || la.id,
          name: la.lehrling_name || la.name || '–',
          prozent: la.ist_abwesend ? 0 : (la.auslastung_prozent || 0),
          istAbwesend: la.ist_abwesend === true,
          abwesenheitsTyp: la.abwesenheits_typ || ''
        });
      });
    }

    // Termine den Spalten zuordnen
    const termineSpalte = {}; // key = "mitarbeiter_2" oder "lehrling_1"
    const nichtZugewiesen = [];

    termine.forEach(t => {
      let zuordnung = null;

      // 1. arbeitszeiten_details._gesamt_mitarbeiter_id
      if (t.arbeitszeiten_details) {
        try {
          const details = typeof t.arbeitszeiten_details === 'string'
            ? JSON.parse(t.arbeitszeiten_details)
            : t.arbeitszeiten_details;
          if (details._gesamt_mitarbeiter_id) {
            zuordnung = {
              typ: details._gesamt_mitarbeiter_id.type,
              id: details._gesamt_mitarbeiter_id.id
            };
          }
        } catch (e) { /* ignore parse errors */ }
      }

      // 2. Fallback: mitarbeiter_id vom Termin
      if (!zuordnung && t.mitarbeiter_id) {
        zuordnung = { typ: 'mitarbeiter', id: t.mitarbeiter_id };
      }

      if (zuordnung) {
        const key = `${zuordnung.typ}_${zuordnung.id}`;
        if (!termineSpalte[key]) termineSpalte[key] = [];
        termineSpalte[key].push(t);
      } else {
        nichtZugewiesen.push(t);
      }
    });

    // "Nicht zugewiesen"-Spalte hinzufügen wenn nötig
    if (nichtZugewiesen.length > 0) {
      spalten.push({
        typ: 'nicht_zugewiesen',
        id: 0,
        name: 'Nicht zugew.',
        prozent: 0,
        istAbwesend: false,
        abwesenheitsTyp: ''
      });
      termineSpalte['nicht_zugewiesen_0'] = nichtZugewiesen;
    }

    // Keine Spalten? Fallback
    if (spalten.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">Keine Mitarbeiter für diesen Tag gefunden</div>';
      return;
    }

    // Grid HTML aufbauen
    const abwIcons = { urlaub: '🏖️', krank: '🤒', berufsschule: '🏫', lehrgang: '📚' };

    let html = '<div class="kalender-tag-ma-grid">';

    // Zeitspalte links
    html += '<div class="kalender-tag-ma-zeit-spalte">';
    html += '<div class="ma-zeit-header"></div>';
    for (let h = startStunde; h <= endStunde; h++) {
      html += `<div class="ma-zeit-label">${String(h).padStart(2, '0')}:00</div>`;
    }
    html += '</div>';

    // MA-Spalten
    spalten.forEach(sp => {
      const key = `${sp.typ}_${sp.id}`;
      const spTermine = termineSpalte[key] || [];
      const farbe = sp.prozent > 100 ? '#f44336' : sp.prozent > 80 ? '#ff9800' : sp.prozent > 50 ? '#ffc107' : '#4caf50';
      const headerClass = sp.istAbwesend ? ' abwesend' : (sp.typ === 'nicht_zugewiesen' ? ' nicht-zugewiesen' : '');
      const abwIcon = sp.istAbwesend ? (abwIcons[sp.abwesenheitsTyp] || '🏥') : '';

      html += `<div class="kalender-tag-ma-spalte">`;

      // Header
      html += `<div class="kalender-tag-ma-spalte-header${headerClass}">`;
      html += `<span class="ma-name">${this.escapeHtml(sp.name)}</span>`;
      if (sp.istAbwesend) {
        html += `<span>${abwIcon} ${sp.abwesenheitsTyp}</span>`;
      } else if (sp.typ !== 'nicht_zugewiesen') {
        html += `<div class="ma-auslastung">
          <div class="ma-auslastung-track"><div class="ma-auslastung-fill" style="width:${Math.min(sp.prozent, 100)}%;background:${farbe};"></div></div>
          <span class="ma-auslastung-pct">${sp.prozent}%</span>
        </div>`;
      }
      html += '</div>';

      // Body mit Zeitreihen
      html += '<div class="kalender-tag-ma-spalte-body">';
      for (let h = startStunde; h <= endStunde; h++) {
        html += `<div class="ma-zeit-row"></div>`;
      }

      // Termin-Blöcke positionieren
      spTermine.forEach(t => {
        // Startzeit bestimmen
        let startzeit = null;
        if (t.arbeitszeiten_details) {
          try {
            const details = typeof t.arbeitszeiten_details === 'string'
              ? JSON.parse(t.arbeitszeiten_details)
              : t.arbeitszeiten_details;
            if (details._startzeit) startzeit = details._startzeit;
          } catch (e) { /* ignore */ }
        }
        if (!startzeit) startzeit = t.startzeit || t.bring_zeit;
        if (!startzeit) return; // Kein Zeitpunkt → nicht positionierbar

        const istAbgeschlossen = t.status === 'abgeschlossen' && t.tatsaechliche_zeit > 0;
        const dauer = istAbgeschlossen ? t.tatsaechliche_zeit : (t.geschaetzte_zeit || 60);
        const [sh, sm] = startzeit.split(':').map(Number);
        if (isNaN(sh)) return;

        const top = (sh - startStunde + (sm || 0) / 60) * slotHoehe;
        const height = Math.max((dauer / 60) * slotHoehe, 25);
        const statusClass = this.kalenderGetStatusCSS(t.status);
        const schwebendClass = t.ist_schwebend ? ' schwebend' : '';

        // Endzeit berechnen
        const endMinuten = (sh * 60 + (sm || 0)) + dauer;
        const endH = Math.floor(endMinuten / 60);
        const endM = endMinuten % 60;
        const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        const zeitInfo = istAbgeschlossen
          ? `${startzeit} – ${endStr} (${dauer}m ✓)`
          : t.status === 'in_bearbeitung' || t.status === 'in-bearbeitung'
            ? `${startzeit} – läuft...`
            : `${startzeit} (~${dauer}m)`;

        const arbeiten = (t.arbeit || '').split('\n').filter(Boolean);

        html += `<div class="kalender-tag-ma-termin ${statusClass}${schwebendClass}" data-termin-id="${t.id}" style="top:${top}px;height:${height}px;">
          <div class="mat-titel">${t.kennzeichen || t.kunde_name || '?'}</div>
          <div class="mat-arbeit">${arbeiten[0] || ''}</div>
          <div class="mat-zeit">${zeitInfo}</div>
        </div>`;
      });

      html += '</div>'; // spalte-body
      html += '</div>'; // spalte
    });

    html += '</div>'; // grid

    container.innerHTML = html;

    // Jetzt-Linie
    if (this.kalenderIstHeute(this.kalenderState.datum)) {
      const jetzt = new Date();
      const jetztH = jetzt.getHours();
      const jetztM = jetzt.getMinutes();
      if (jetztH >= startStunde && jetztH <= endStunde) {
        const topOffset = (jetztH - startStunde + jetztM / 60) * slotHoehe;
        const gridEl = container.querySelector('.kalender-tag-ma-grid');
        if (gridEl) {
          // Linie in jede Spalte einfügen
          gridEl.querySelectorAll('.kalender-tag-ma-spalte-body').forEach(body => {
            const linie = document.createElement('div');
            linie.className = 'kalender-tag-ma-jetzt-linie';
            linie.style.top = `${topOffset}px`;
            body.appendChild(linie);
          });
        }
      }
    }

    // Termin-Klick-Handler
    container.querySelectorAll('[data-termin-id]').forEach(el => {
      el.addEventListener('click', () => {
        this.kalenderTerminClick(parseInt(el.dataset.terminId));
      });
    });
  }
```

- [ ] **Step 2: Manuell testen**

Browser → Kalender → Tag → "👥 Mitarbeiter" klicken:
- Spalten für Sven, Lars (und ggf. Lehrlinge) erscheinen
- Header zeigt Name + Auslastungsbalken mit %
- Termine erscheinen in der richtigen Spalte mit tatsächlicher Startzeit
- Abgeschlossene Termine zeigen Start – Endzeit mit ✓
- Laufende Termine zeigen "läuft..."
- Nicht zugewiesene Termine in eigener Spalte rechts
- Jetzt-Linie (wenn heute) über alle Spalten
- Klick auf Termin öffnet Termindetails
- Abwesende MA haben ausgegrauten Header mit Icon

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: implement renderKalenderTagMitarbeiter with MA columns and Stempelzeiten"
```

---

### Task 5: Finaler Test & Deploy

- [ ] **Step 1: Alle drei Modi testen**

Browser → Kalender → Tag:
- **Zeitleiste**: Funktioniert wie bisher, keine Regression
- **Liste**: Funktioniert wie bisher, keine Regression
- **Mitarbeiter**: Spalten korrekt, Stempelzeiten korrekt, Termine klickbar

- [ ] **Step 2: Toggle-Wechsel testen**

Zwischen allen drei Modi hin und her wechseln — keine Darstellungsfehler, korrekte Anzeige/Versteckung.

- [ ] **Step 3: Build und Deploy**

```bash
cd frontend && npm run build && cd ..
git push
scp "frontend/dist/assets/main-XXXXXXXX.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend/dist/assets/main-XXXXXXXX.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend/dist/index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git stash && git pull && systemctl restart werkstatt-terminplaner && echo 'DEPLOY OK'"
```

Dateinamen nach Build anpassen (Hash ändert sich).
