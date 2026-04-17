# Zeitstempelung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neuer Tab "Zeitstempelung" zeigt tagesbasiert alle Mitarbeiter/Lehrlinge mit Stempelzeiten je Arbeit; Erfassung über Intern Tab, Tablet App (Echtzeit) und Plan Beta Tab (manuell).

**Architecture:** Zwei neue Spalten (`stempel_start`, `stempel_ende`) in `termine_arbeiten`. Neuer Backend-Controller für Übersicht (GET) und Stempel setzen (PUT). Frontend-Tab für read-only Übersicht, Stempel-Buttons im Intern Tab, manuelle Felder im Plan Beta Tab, Stempel-Buttons in der Tablet App. Stempel werden per `termin_id + arbeit_name` adressiert (konsistent mit bestehender Frontend-Datenstruktur).

**Tech Stack:** Node.js/Express/SQLite (Backend), Vanilla JS (Frontend), Electron (Tablet App)

---

## File Map

| Aktion | Datei | Zweck |
|---|---|---|
| CREATE | `backend/migrations/032_stempel_felder.js` | Zwei neue Spalten in termine_arbeiten |
| MODIFY | `backend/migrations/index.js` | Migration 032 registrieren |
| CREATE | `backend/src/controllers/stempelzeitenController.js` | GET Tagesübersicht + PUT Stempel setzen |
| CREATE | `backend/src/routes/stempelzeitenRoutes.js` | Route-Definitionen |
| MODIFY | `backend/src/routes/index.js` | Router mounten |
| CREATE | `backend/tests/stempelzeiten.test.js` | Tests für Controller |
| MODIFY | `frontend/index.html` | Tab-Button + Tab-Inhalt (Zeitstempelung) |
| MODIFY | `frontend/src/components/app.js` | Tab-Logik, Intern-Tab-Erweiterung, Plan-Beta-Erweiterung |
| MODIFY | `electron-intern-tablet/index.html` | Stempel-Buttons pro Arbeit |

---

## Task 1: Migration 032 — stempel_start / stempel_ende

**Files:**
- Create: `backend/migrations/032_stempel_felder.js`
- Modify: `backend/migrations/index.js`

- [ ] **Schritt 1: Migration-Datei anlegen**

```js
// backend/migrations/032_stempel_felder.js
const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 32,
  description: 'Stempel-Felder: stempel_start und stempel_ende in termine_arbeiten',

  async up(db) {
    console.log('Migration 032: Füge stempel_start/stempel_ende zu termine_arbeiten hinzu...');
    await safeAlterTable(db,
      'ALTER TABLE termine_arbeiten ADD COLUMN stempel_start TEXT',
      'termine_arbeiten.stempel_start'
    );
    await safeAlterTable(db,
      'ALTER TABLE termine_arbeiten ADD COLUMN stempel_ende TEXT',
      'termine_arbeiten.stempel_ende'
    );
    console.log('✓ Migration 032 abgeschlossen');
  },

  async down(db) {
    // SQLite unterstützt kein DROP COLUMN – Migration ist irreversibel
    console.log('Migration 032: Rollback nicht unterstützt (SQLite DROP COLUMN fehlt)');
  }
};
```

- [ ] **Schritt 2: Migration in index.js registrieren**

In `backend/migrations/index.js`, Zeile 49 (nach der letzten `require`-Zeile), ergänzen:

```js
  require('./031_add_lehrling_id_to_termine'), // Version 31 - lehrling_id in termine
  require('./032_stempel_felder'),              // Version 32 - Stempel-Felder in termine_arbeiten
```

- [ ] **Schritt 3: Migration manuell testen**

```bash
cd backend && node -e "
const db = require('./src/config/database').getDb();
db.all('PRAGMA table_info(termine_arbeiten)', (e, rows) => {
  console.log(rows.map(r => r.name));
});
"
```

Erwartete Ausgabe enthält: `[..., 'stempel_start', 'stempel_ende']`

- [ ] **Schritt 4: Commit**

```bash
git add backend/migrations/032_stempel_felder.js backend/migrations/index.js
git commit -m "feat: Migration 032 - stempel_start/stempel_ende in termine_arbeiten"
```

---

## Task 2: Backend Controller + Routes

**Files:**
- Create: `backend/src/controllers/stempelzeitenController.js`
- Create: `backend/src/routes/stempelzeitenRoutes.js`

- [ ] **Schritt 1: Test-Datei anlegen (schlägt fehl — korrekt)**

```js
// backend/tests/stempelzeiten.test.js
const { createTestDb, closeTestDb, dbRun, dbGet, dbAll } = require('./helpers/testSetup');

describe('Stempelzeiten', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    await dbRun(db, `INSERT OR IGNORE INTO mitarbeiter (id, name, aktiv) VALUES (1, 'Max Mustermann', 1)`);
    await dbRun(db, `
      INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, arbeit, status, mitarbeiter_id, geschaetzte_zeit)
      VALUES ('T-TEST-001', 'Kunde Test', 'WN-AB 123', '2026-04-16', 'Ölwechsel', 'in_arbeit', 1, 45)
    `);
    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-TEST-001'`);
    await dbRun(db, `
      INSERT INTO termine_arbeiten (termin_id, arbeit, zeit, mitarbeiter_id, reihenfolge)
      VALUES (?, 'Ölwechsel', 45, 1, 0)
    `, [termin.id]);
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  test('stempel_start und stempel_ende Spalten existieren', async () => {
    const cols = await dbAll(db, `PRAGMA table_info(termine_arbeiten)`);
    const namen = cols.map(c => c.name);
    expect(namen).toContain('stempel_start');
    expect(namen).toContain('stempel_ende');
  });

  test('Stempel setzen schreibt stempel_start', async () => {
    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-TEST-001'`);
    await dbRun(db,
      `UPDATE termine_arbeiten SET stempel_start = ? WHERE termin_id = ? AND arbeit = ?`,
      ['08:15', termin.id, 'Ölwechsel']
    );
    const row = await dbGet(db, `SELECT stempel_start FROM termine_arbeiten WHERE termin_id = ?`, [termin.id]);
    expect(row.stempel_start).toBe('08:15');
  });

  test('Stempel setzen schreibt stempel_ende', async () => {
    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-TEST-001'`);
    await dbRun(db,
      `UPDATE termine_arbeiten SET stempel_ende = ? WHERE termin_id = ? AND arbeit = ?`,
      ['09:00', termin.id, 'Ölwechsel']
    );
    const row = await dbGet(db, `SELECT stempel_ende FROM termine_arbeiten WHERE termin_id = ?`, [termin.id]);
    expect(row.stempel_ende).toBe('09:00');
  });

  test('Tagesübersicht liefert Arbeiten für ein Datum', async () => {
    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-TEST-001'`);
    await dbRun(db,
      `UPDATE termine_arbeiten SET stempel_start = '08:15', stempel_ende = '09:00' WHERE termin_id = ? AND arbeit = ?`,
      [termin.id, 'Ölwechsel']
    );
    const rows = await dbAll(db, `
      SELECT ta.id, ta.arbeit, ta.zeit, ta.stempel_start, ta.stempel_ende,
             t.termin_nr, t.kennzeichen, t.kunde_name,
             m.name as mitarbeiter_name
      FROM termine_arbeiten ta
      JOIN termine t ON ta.termin_id = t.id
      LEFT JOIN mitarbeiter m ON ta.mitarbeiter_id = m.id
      WHERE t.datum = '2026-04-16'
      ORDER BY m.name, ta.reihenfolge
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].arbeit).toBe('Ölwechsel');
    expect(rows[0].stempel_start).toBe('08:15');
    expect(rows[0].stempel_ende).toBe('09:00');
    expect(rows[0].mitarbeiter_name).toBe('Max Mustermann');
  });
});
```

- [ ] **Schritt 2: Tests ausführen (müssen scheitern)**

```bash
cd backend && npm test -- --testPathPattern=stempelzeiten --no-coverage
```

Erwartete Ausgabe: `FAIL` mit "stempel_start und stempel_ende Spalten existieren" fehlgeschlagen.

- [ ] **Schritt 3: Controller anlegen**

```js
// backend/src/controllers/stempelzeitenController.js
const { allAsync, runAsync } = require('../utils/dbHelper');
const asyncHandler = require('../middleware/asyncHandler');
const { broadcastEvent } = require('../utils/websocket');

const ZEIT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

class StempelzeitenController {
  // GET /api/stempelzeiten?datum=YYYY-MM-DD
  static getTagUebersicht = asyncHandler(async (req, res) => {
    const datum = req.query.datum || new Date().toISOString().slice(0, 10);

    const rows = await allAsync(`
      SELECT
        ta.id        AS arbeit_id,
        ta.termin_id,
        ta.arbeit,
        ta.zeit      AS geschaetzte_min,
        ta.stempel_start,
        ta.stempel_ende,
        ta.reihenfolge,
        t.termin_nr,
        t.kennzeichen,
        t.kunde_name,
        'mitarbeiter' AS person_typ,
        m.id          AS person_id,
        m.name        AS person_name
      FROM termine_arbeiten ta
      JOIN termine t ON ta.termin_id = t.id
      JOIN mitarbeiter m ON ta.mitarbeiter_id = m.id
      WHERE t.datum = ?
        AND ta.mitarbeiter_id IS NOT NULL

      UNION ALL

      SELECT
        ta.id        AS arbeit_id,
        ta.termin_id,
        ta.arbeit,
        ta.zeit      AS geschaetzte_min,
        ta.stempel_start,
        ta.stempel_ende,
        ta.reihenfolge,
        t.termin_nr,
        t.kennzeichen,
        t.kunde_name,
        'lehrling'   AS person_typ,
        l.id         AS person_id,
        l.name        AS person_name
      FROM termine_arbeiten ta
      JOIN termine t ON ta.termin_id = t.id
      JOIN lehrlinge l ON ta.lehrling_id = l.id
      WHERE t.datum = ?
        AND ta.lehrling_id IS NOT NULL

      ORDER BY person_name, termin_id, reihenfolge
    `, [datum, datum]);

    // Gruppieren nach Person
    const gruppenMap = new Map();
    for (const row of rows) {
      const key = `${row.person_typ}_${row.person_id}`;
      if (!gruppenMap.has(key)) {
        gruppenMap.set(key, {
          person_typ: row.person_typ,
          person_id: row.person_id,
          person_name: row.person_name,
          arbeiten: []
        });
      }
      const istMin = row.stempel_start && row.stempel_ende
        ? StempelzeitenController._diffMinuten(row.stempel_start, row.stempel_ende)
        : null;
      gruppenMap.get(key).arbeiten.push({
        arbeit_id:       row.arbeit_id,
        termin_id:       row.termin_id,
        termin_nr:       row.termin_nr,
        kennzeichen:     row.kennzeichen,
        kunde_name:      row.kunde_name,
        arbeit:          row.arbeit,
        geschaetzte_min: row.geschaetzte_min,
        stempel_start:   row.stempel_start,
        stempel_ende:    row.stempel_ende,
        ist_min:         istMin
      });
    }

    res.json(Array.from(gruppenMap.values()));
  });

  // PUT /api/stempelzeiten/stempel
  // Body: { termin_id, arbeit_name, stempel_start?, stempel_ende? }
  static setStempel = asyncHandler(async (req, res) => {
    const { termin_id, arbeit_name, stempel_start, stempel_ende } = req.body;

    if (!termin_id || !arbeit_name) {
      return res.status(400).json({ error: 'termin_id und arbeit_name sind Pflichtfelder' });
    }
    if (stempel_start !== undefined && stempel_start !== null && !ZEIT_REGEX.test(stempel_start)) {
      return res.status(400).json({ error: 'stempel_start muss Format HH:MM haben' });
    }
    if (stempel_ende !== undefined && stempel_ende !== null && !ZEIT_REGEX.test(stempel_ende)) {
      return res.status(400).json({ error: 'stempel_ende muss Format HH:MM haben' });
    }

    const updates = [];
    const values = [];
    if (stempel_start !== undefined) { updates.push('stempel_start = ?'); values.push(stempel_start); }
    if (stempel_ende !== undefined)  { updates.push('stempel_ende = ?');  values.push(stempel_ende);  }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Mindestens stempel_start oder stempel_ende angeben' });
    }

    values.push(termin_id, arbeit_name);
    const result = await runAsync(
      `UPDATE termine_arbeiten SET ${updates.join(', ')} WHERE termin_id = ? AND arbeit = ?`,
      values
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Arbeit nicht gefunden' });
    }

    broadcastEvent('stempel.updated', { termin_id, arbeit_name });
    res.json({ changes: result.changes, message: 'Stempel gesetzt' });
  });

  static _diffMinuten(start, ende) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = ende.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  }
}

module.exports = StempelzeitenController;
```

- [ ] **Schritt 4: Routes anlegen**

```js
// backend/src/routes/stempelzeitenRoutes.js
const express = require('express');
const router = express.Router();
const StempelzeitenController = require('../controllers/stempelzeitenController');

router.get('/', StempelzeitenController.getTagUebersicht);
router.put('/stempel', StempelzeitenController.setStempel);

module.exports = router;
```

- [ ] **Schritt 5: Tests ausführen (müssen jetzt grün sein)**

```bash
cd backend && npm test -- --testPathPattern=stempelzeiten --no-coverage
```

Erwartete Ausgabe: `PASS` — 4 Tests bestanden.

- [ ] **Schritt 6: Commit**

```bash
git add backend/src/controllers/stempelzeitenController.js backend/src/routes/stempelzeitenRoutes.js backend/tests/stempelzeiten.test.js
git commit -m "feat: StempelzeitenController + Routes + Tests"
```

---

## Task 3: Route mounten

**Files:**
- Modify: `backend/src/routes/index.js`

- [ ] **Schritt 1: Import ergänzen**

In `backend/src/routes/index.js` nach Zeile 31 (`const wiederkehrendeTermineRoutes = require('./wiederkehrendeTermineRoutes');`) einfügen:

```js
const stempelzeitenRoutes = require('./stempelzeitenRoutes');
```

- [ ] **Schritt 2: Router mounten**

In `backend/src/routes/index.js` nach Zeile 63 (`router.use('/wiederkehrende-termine', wiederkehrendeTermineRoutes);`) einfügen:

```js
router.use('/stempelzeiten', stempelzeitenRoutes);
```

- [ ] **Schritt 3: Endpunkt manuell prüfen**

Backend starten (`cd backend && npm run dev`) und aufrufen:

```
GET http://localhost:3001/api/stempelzeiten?datum=2026-04-16
```

Erwartete Antwort: JSON-Array (leer oder mit Daten, kein 404/500).

- [ ] **Schritt 4: Commit**

```bash
git add backend/src/routes/index.js
git commit -m "feat: /api/stempelzeiten Route registriert"
```

---

## Task 4: Neuer Tab "Zeitstempelung" — HTML

**Files:**
- Modify: `frontend/index.html`

- [ ] **Schritt 1: Tab-Button einfügen**

In `frontend/index.html` nach Zeile 59 (`<button class="tab-button" data-tab="intern">`) **nach** dem Intern-Button und **vor** dem Papierkorb-Button einfügen:

```html
            <button class="tab-button" data-tab="zeitstempelung"><span>🕐 Zeitstempelung</span></button>
```

- [ ] **Schritt 2: Tab-Inhalt einfügen**

In `frontend/index.html` nach dem `<div id="intern" ...>` Block (suche nach `id="papierkorb"`) **davor** einfügen:

```html
        <div id="zeitstempelung" class="tab-content" data-template-id="tab-template-zeitstempelung"></div>

        <template id="tab-template-zeitstempelung">
            <div class="page-header">
                <h2>🕐 Zeitstempelung</h2>
                <p class="page-subtitle">Tagesübersicht aller Stempelzeiten nach Mitarbeiter</p>
            </div>

            <div class="auslastung-navigation">
                <div class="nav-row">
                    <button type="button" id="zeitstempelungPrevTag" class="btn btn-nav" title="Vorheriger Tag">◀ Tag</button>
                    <div class="form-group" style="margin: 0;">
                        <input type="date" id="zeitstempelungDatum">
                    </div>
                    <button type="button" id="zeitstempelungNextTag" class="btn btn-nav" title="Nächster Tag">Tag ▶</button>
                    <button type="button" id="zeitstempelungHeuteBtn" class="btn btn-today" title="Heute">Heute</button>
                </div>
            </div>

            <div id="zeitstempelungContainer" style="margin-top: 20px;">
                <p class="loading-text">Lade Stempelzeiten…</p>
            </div>
        </template>
```

- [ ] **Schritt 3: Frontend bauen und Tab-Button visuell prüfen**

```bash
cd frontend && npm run dev
```

Browser öffnen → Tab "🕐 Zeitstempelung" muss in der Tab-Leiste sichtbar sein. Klicken muss den Tab öffnen (leer, ohne Fehler).

- [ ] **Schritt 4: Commit**

```bash
git add frontend/index.html
git commit -m "feat: Tab Zeitstempelung HTML-Struktur"
```

---

## Task 5: Zeitstempelung Tab — JavaScript

**Files:**
- Modify: `frontend/src/components/app.js`

- [ ] **Schritt 1: Tab-Aktivierung registrieren**

In `app.js` in der Methode die auf Tab-Wechsel reagiert (suche `tabName === 'auslastung-dragdrop'` — ca. Zeile 3083), direkt danach ergänzen:

```js
      } else if (tabName === 'zeitstempelung') {
        const datumInput = document.getElementById('zeitstempelungDatum');
        if (datumInput && !datumInput.value) {
          datumInput.value = this.formatDateLocal(this.getToday());
        }
        this.loadZeitstempelung();
```

- [ ] **Schritt 2: Event-Listener für Datumsnavigation registrieren**

In der `init()`-Methode (suche `bindEventListenerOnce(dragDropDatum` — ca. Zeile 907), direkt danach ergänzen:

```js
      const zeitstempelungDatum = document.getElementById('zeitstempelungDatum');
      this.bindEventListenerOnce(zeitstempelungDatum, 'change', () => this.loadZeitstempelung());

      const ztPrev = document.getElementById('zeitstempelungPrevTag');
      this.bindEventListenerOnce(ztPrev, 'click', () => {
        const inp = document.getElementById('zeitstempelungDatum');
        if (!inp) return;
        const d = new Date(inp.value + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        inp.value = this.formatDateLocal(d);
        this.loadZeitstempelung();
      });

      const ztNext = document.getElementById('zeitstempelungNextTag');
      this.bindEventListenerOnce(ztNext, 'click', () => {
        const inp = document.getElementById('zeitstempelungDatum');
        if (!inp) return;
        const d = new Date(inp.value + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        inp.value = this.formatDateLocal(d);
        this.loadZeitstempelung();
      });

      const ztHeute = document.getElementById('zeitstempelungHeuteBtn');
      this.bindEventListenerOnce(ztHeute, 'click', () => {
        const inp = document.getElementById('zeitstempelungDatum');
        if (!inp) return;
        inp.value = this.formatDateLocal(this.getToday());
        this.loadZeitstempelung();
      });
```

- [ ] **Schritt 3: loadZeitstempelung() Methode einfügen**

Nach der Methode `loadInternTeamUebersicht` (suche `async loadInternTeamUebersicht`) eine neue Methode anfügen:

```js
  async loadZeitstempelung() {
    const container = document.getElementById('zeitstempelungContainer');
    const datumInput = document.getElementById('zeitstempelungDatum');
    if (!container || !datumInput) return;

    const datum = datumInput.value || this.formatDateLocal(this.getToday());
    container.innerHTML = '<p class="loading-text">Lade Stempelzeiten…</p>';

    try {
      const gruppen = await ApiService.get(`/stempelzeiten?datum=${datum}`);

      if (!gruppen || gruppen.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Arbeiten für diesen Tag.</p></div>';
        return;
      }

      container.innerHTML = gruppen.map(g => this.renderZeitstempelungGruppe(g)).join('');
    } catch (err) {
      console.error('[Zeitstempelung] Ladefehler:', err);
      container.innerHTML = '<div class="error-state"><p>Fehler beim Laden der Stempelzeiten.</p></div>';
    }
  }

  renderZeitstempelungGruppe(gruppe) {
    const gesamtGeschaetzt = gruppe.arbeiten.reduce((s, a) => s + (a.geschaetzte_min || 0), 0);
    const gesamtIst = gruppe.arbeiten.reduce((s, a) => s + (a.ist_min || 0), 0);
    const icon = gruppe.person_typ === 'lehrling' ? '🎓' : '👷';

    const rows = gruppe.arbeiten.map(a => {
      const istMin = a.ist_min;
      const geschMin = a.geschaetzte_min || 0;
      const ueberschritten = istMin !== null && geschMin > 0 && istMin > geschMin * 1.1;
      const istText = a.stempel_start && !a.stempel_ende
        ? '<span class="badge badge-info">laufend…</span>'
        : istMin !== null
          ? `<span class="${ueberschritten ? 'text-warning' : 'text-success'}">${istMin} Min${ueberschritten ? ' ⚠️' : ''}</span>`
          : '<span class="text-muted">—</span>';

      return `
        <tr>
          <td>${this.escapeHtml(a.termin_nr || '')}</td>
          <td>${this.escapeHtml(a.kennzeichen || '')}</td>
          <td>${this.escapeHtml(a.arbeit)}</td>
          <td class="text-success">${a.stempel_start || '<span class="text-muted">—</span>'}</td>
          <td class="text-danger">${a.stempel_ende || '<span class="text-muted">—</span>'}</td>
          <td class="text-warning">${geschMin ? geschMin + ' Min' : '—'}</td>
          <td>${istText}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${icon} ${this.escapeHtml(gruppe.person_name)}</strong>
          <span class="text-muted" style="font-size:13px;">
            Geschätzt: ${gesamtGeschaetzt} Min
            ${gesamtIst ? '· Gestempelt: ' + gesamtIst + ' Min' : ''}
          </span>
        </div>
        <div class="card-body" style="padding:0;">
          <table class="table table-striped" style="margin:0;">
            <thead>
              <tr>
                <th>Auftrag</th>
                <th>Kennzeichen</th>
                <th>Arbeit</th>
                <th class="text-success">Start ▶</th>
                <th class="text-danger">Ende ■</th>
                <th class="text-warning">Geschätzt</th>
                <th>Ist-Zeit</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }
```

- [ ] **Schritt 4: WebSocket-Event reagieren**

In der WebSocket-Message-Handler-Methode (suche `handleWebSocketMessage`) ergänzen:

```js
      if (event.type === 'stempel.updated') {
        if (document.getElementById('zeitstempelung')?.classList.contains('active')) {
          this.loadZeitstempelung();
        }
      }
```

- [ ] **Schritt 5: Funktion zum Stempel setzen**

Nach `renderZeitstempelungGruppe` einfügen:

```js
  async stempelSetzen(terminId, arbeitName, typ) {
    const jetzt = new Date();
    const zeit = `${String(jetzt.getHours()).padStart(2,'0')}:${String(jetzt.getMinutes()).padStart(2,'0')}`;
    const body = { termin_id: terminId, arbeit_name: arbeitName };
    if (typ === 'start') body.stempel_start = zeit;
    else body.stempel_ende = zeit;

    try {
      await ApiService.put('/stempelzeiten/stempel', body);
    } catch (err) {
      console.error('[Stempel] Fehler:', err);
      alert('Fehler beim Stempeln.');
    }
  }

  async stempelManuellSetzen(terminId, arbeitName, typ, zeitWert) {
    if (!zeitWert) return;
    const body = { termin_id: terminId, arbeit_name: arbeitName };
    if (typ === 'start') body.stempel_start = zeitWert;
    else body.stempel_ende = zeitWert;

    try {
      await ApiService.put('/stempelzeiten/stempel', body);
    } catch (err) {
      console.error('[Stempel manuell] Fehler:', err);
      alert('Fehler beim Speichern der Zeit.');
    }
  }
```

- [ ] **Schritt 6: Visuell testen**

Im Dev-Server Tab wechseln, Datum wählen, prüfen dass Tabelle erscheint und korrekt gruppiert ist.

- [ ] **Schritt 7: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: Zeitstempelung Tab - loadZeitstempelung, renderZeitstempelungGruppe, stempelSetzen"
```

---

## Task 6: Intern Tab — Stempel-Buttons pro Arbeit

**Files:**
- Modify: `frontend/src/components/app.js`

Die Methode `internRenderArbeitenListe` (ca. Zeile 30430) zeigt aktuell Einzelarbeiten mit "✓ Fertig"-Button. Hier werden Start/Ende-Stempel-Buttons ergänzt. Die Methode erhält zusätzlich den Parameter `terminId` und `arbeiten_mit_stempel` aus der API.

- [ ] **Schritt 1: internRenderArbeitenListe erweitern**

Die bestehende Methode `internRenderArbeitenListe` (Zeile 30430–30444) **ersetzen** durch:

```js
  internRenderArbeitenListe(termin, personId, typ) {
    const arbeiten = this.internGetArbeitenFromTermin(termin);
    if (!arbeiten.length) return '';

    // Stempel-Daten aus termin.termine_arbeiten_stempel (falls vom API mitgeliefert)
    const stempelMap = {};
    if (Array.isArray(termin.termine_arbeiten_stempel)) {
      for (const s of termin.termine_arbeiten_stempel) {
        stempelMap[s.arbeit] = s;
      }
    }

    return `
      <div class="intern-arbeiten-liste">
        ${arbeiten.map(a => {
          const stempel = stempelMap[a.name] || {};
          const hatStart = !!stempel.stempel_start;
          const hatEnde  = !!stempel.stempel_ende;
          const startBtn = hatStart
            ? `<span class="intern-stempel-zeit text-success">▶ ${stempel.stempel_start}</span>`
            : `<button class="intern-tab-btn intern-tab-btn-confirm intern-tab-btn-sm"
                onclick="app.stempelSetzen(${termin.id}, '${this.escapeHtml(a.name).replace(/'/g, "\\'")}', 'start').then(() => app.loadInternTeamUebersicht())">
                ▶ Start
               </button>`;
          const endeBtn = hatEnde
            ? `<span class="intern-stempel-zeit text-danger">■ ${stempel.stempel_ende}</span>`
            : `<button class="intern-tab-btn intern-tab-btn-complete intern-tab-btn-sm"
                ${!hatStart ? 'disabled' : ''}
                onclick="app.stempelSetzen(${termin.id}, '${this.escapeHtml(a.name).replace(/'/g, "\\'")}', 'ende').then(() => app.loadInternTeamUebersicht())">
                ■ Ende
               </button>`;
          return `
            <div class="intern-arbeit-item ${a.abgeschlossen ? 'abgeschlossen' : ''}">
              <span class="arbeit-name">${a.abgeschlossen ? '✅' : '○'} ${this.escapeHtml(a.name)}</span>
              <div class="intern-arbeit-stempel-buttons">
                ${startBtn}
                ${endeBtn}
                ${!a.abgeschlossen ? `<button class="intern-btn-einzelarbeit-fertig"
                  onclick="app.internBeendenEinzelarbeit(${termin.id}, ${a.index}, this)">✓ Fertig</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
```

- [ ] **Schritt 2: Stempel-Daten beim Laden der Termine mitladen**

In `loadInternTeamUebersicht` (suche `loadInternTeamUebersicht`) wird die Terminliste geladen. Nach dem Laden der Termine für heute, die `termine_arbeiten_stempel`-Daten ergänzen. Suche den Block wo `termine` befüllt werden, und füge nach dem `await` einen weiteren Aufruf ein:

```js
    // Stempel-Daten für alle Termine nachladen
    const heute = this.formatDateLocal(this.getToday());
    try {
      const stempelGruppen = await ApiService.get(`/stempelzeiten?datum=${heute}`);
      // Stempel je termin_id + arbeit_name als Map aufbauen
      const stempelByTermin = {};
      for (const gruppe of stempelGruppen) {
        for (const a of gruppe.arbeiten) {
          if (!stempelByTermin[a.termin_id]) stempelByTermin[a.termin_id] = [];
          stempelByTermin[a.termin_id].push(a);
        }
      }
      // An die Termine anhängen
      for (const t of termine) {
        t.termine_arbeiten_stempel = stempelByTermin[t.id] || [];
      }
    } catch (e) {
      // Stempel-Laden ist nicht kritisch — nur loggen
      console.warn('[Stempel] Stempel-Daten konnten nicht geladen werden:', e);
    }
```

- [ ] **Schritt 3: Visuell testen**

Im Intern Tab: Auftrag mit mehreren Arbeiten öffnen — jede Arbeit muss Start/Ende-Buttons zeigen. Start drücken → Zeit erscheint grün. Ende drücken → Zeit erscheint rot.

- [ ] **Schritt 4: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: Intern Tab - Start/Ende Stempel-Buttons pro Arbeit"
```

---

## Task 7: Plan Beta Tab — Manuelle Zeitfelder

**Files:**
- Modify: `frontend/src/components/app.js`

Der Plan Beta Tab rendert Terminblöcke in einer Zeitleiste. Jede Terminzeile bekommt ein aufklappbares Panel mit Zeit-Inputs.

- [ ] **Schritt 1: renderPlanungTerminStempelPanel() Methode anlegen**

Nach `stempelManuellSetzen` einfügen:

```js
  renderPlanungTerminStempelPanel(termin) {
    const arbeiten = this.internGetArbeitenFromTermin(termin);
    if (!arbeiten.length) {
      // Einfacher Auftrag ohne Einzelarbeiten: eine Zeile für den Gesamtauftrag
      const arbeitName = termin.arbeit || 'Auftrag';
      const stempel = (termin.termine_arbeiten_stempel || []).find(s => s.arbeit === arbeitName) || {};
      return `
        <div class="planung-stempel-panel">
          <div class="planung-stempel-row">
            <span class="planung-stempel-label">${this.escapeHtml(arbeitName)}</span>
            <div class="form-group-inline">
              <label class="text-success" style="font-size:12px;">Start</label>
              <input type="time" class="form-control form-control-sm"
                value="${stempel.stempel_start || ''}"
                onchange="app.stempelManuellSetzen(${termin.id}, '${this.escapeHtml(arbeitName).replace(/'/g,"\\'")}', 'start', this.value)">
            </div>
            <div class="form-group-inline">
              <label class="text-danger" style="font-size:12px;">Ende</label>
              <input type="time" class="form-control form-control-sm"
                value="${stempel.stempel_ende || ''}"
                onchange="app.stempelManuellSetzen(${termin.id}, '${this.escapeHtml(arbeitName).replace(/'/g,"\\'")}', 'ende', this.value)">
            </div>
          </div>
        </div>
      `;
    }

    const rows = arbeiten.map(a => {
      const stempel = (termin.termine_arbeiten_stempel || []).find(s => s.arbeit === a.name) || {};
      return `
        <div class="planung-stempel-row">
          <span class="planung-stempel-label">${this.escapeHtml(a.name)}</span>
          <div class="form-group-inline">
            <label class="text-success" style="font-size:12px;">Start</label>
            <input type="time" class="form-control form-control-sm"
              value="${stempel.stempel_start || ''}"
              onchange="app.stempelManuellSetzen(${termin.id}, '${this.escapeHtml(a.name).replace(/'/g,"\\'")}', 'start', this.value)">
          </div>
          <div class="form-group-inline">
            <label class="text-danger" style="font-size:12px;">Ende</label>
            <input type="time" class="form-control form-control-sm"
              value="${stempel.stempel_ende || ''}"
              onchange="app.stempelManuellSetzen(${termin.id}, '${this.escapeHtml(a.name).replace(/'/g,"\\'")}', 'ende', this.value)">
          </div>
        </div>
      `;
    }).join('');

    return `<div class="planung-stempel-panel">${rows}</div>`;
  }
```

- [ ] **Schritt 2: Stempel-Panel in Planungs-Terminblöcke einbinden**

In `loadAuslastungDragDrop` (ca. Zeile 22087) werden nach dem Laden der Termine auch Stempel-Daten geholt. Suche den Block wo `termine` befüllt werden und ergänze dasselbe Laden wie in Task 6 Schritt 2 (identischer Code — Stempel by termin_id Map aufbauen und an die Termine hängen).

Dann in der Render-Funktion die den Termin-Block HTML erzeugt (suche `renderPlanungTerminBlock` oder die Stelle wo `class="planung-termin-block"` erzeugt wird) das Stempel-Panel anhängen:

```js
    // Am Ende des Termin-Block-HTML, vor dem schließenden </div>:
    ${this.renderPlanungTerminStempelPanel(termin)}
```

- [ ] **Schritt 3: Visuell testen**

Plan Beta Tab öffnen, Datum wählen — unter jedem Terminblock müssen Start/Ende-Zeitfelder erscheinen. Zeit eingeben → Tab Zeitstempelung prüfen ob Wert gespeichert wurde.

- [ ] **Schritt 4: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: Plan Beta Tab - manuelle Stempel-Zeitfelder pro Arbeit"
```

---

## Task 8: Tablet App — Stempel-Buttons pro Arbeit

**Files:**
- Modify: `electron-intern-tablet/index.html`

Die Tablet App hat eine eigene `index.html` mit eingebettetem JS. Die Auftrags-Kacheln zeigen aktuell einen "Starten"-Button pro Auftrag. Hier wird pro Arbeit ein Start/Ende-Button ergänzt.

- [ ] **Schritt 1: Stempel-Hilfsfunktionen im Tablet-JS ergänzen**

In `electron-intern-tablet/index.html`, im `<script>`-Block, nach der Funktion `internStarten` (suche `function internStarten`) einfügen:

```js
async function stempelSetzen(terminId, arbeitName, typ) {
  const jetzt = new Date();
  const zeit = String(jetzt.getHours()).padStart(2,'0') + ':' + String(jetzt.getMinutes()).padStart(2,'0');
  const body = { termin_id: terminId, arbeit_name: arbeitName };
  if (typ === 'start') body.stempel_start = zeit;
  else body.stempel_ende = zeit;
  try {
    await fetch(`${API_BASE}/stempelzeiten/stempel`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await ladeDaten(); // Ansicht neu laden
  } catch (e) {
    console.error('[Stempel] Fehler:', e);
    alert('Fehler beim Stempeln.');
  }
}
```

- [ ] **Schritt 2: Arbeiten-Render-Funktion erweitern**

In `electron-intern-tablet/index.html`, suche die Funktion die Auftrags-Kacheln rendert (suche `renderKachel` oder `renderPerson` oder den Block mit `intern-tab-btn`). In der Stelle wo die Arbeiten einer Kachel gerendert werden, die Stempel-Buttons ergänzen:

```js
function renderArbeitenMitStempel(termin, arbeiten, stempelMap) {
  if (!arbeiten || arbeiten.length === 0) return '';
  return `
    <div class="intern-arbeiten-liste">
      ${arbeiten.map(a => {
        const stempel = stempelMap[a.name] || {};
        const hatStart = !!stempel.stempel_start;
        const hatEnde  = !!stempel.stempel_ende;
        return `
          <div class="intern-arbeit-item${a.abgeschlossen ? ' abgeschlossen' : ''}">
            <span>${a.abgeschlossen ? '✅' : '○'} ${escapeHtml(a.name)}</span>
            <div style="display:flex;gap:6px;margin-top:4px;">
              ${hatStart
                ? `<span style="color:var(--success);font-size:13px;">▶ ${stempel.stempel_start}</span>`
                : `<button class="intern-tab-btn intern-tab-btn-confirm" style="font-size:13px;"
                    onclick="stempelSetzen(${termin.id}, '${escapeHtml(a.name).replace(/'/g,"\\'")}', 'start')">▶ Start</button>`
              }
              ${hatEnde
                ? `<span style="color:var(--danger);font-size:13px;">■ ${stempel.stempel_ende}</span>`
                : `<button class="intern-tab-btn intern-tab-btn-complete" style="font-size:13px;" ${!hatStart ? 'disabled' : ''}
                    onclick="stempelSetzen(${termin.id}, '${escapeHtml(a.name).replace(/'/g,"\\'")}', 'ende')">■ Ende</button>`
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
```

- [ ] **Schritt 3: Stempel-Daten beim Laden der Termine einbinden**

In der Funktion `ladeDaten()` (oder der Hauptlade-Funktion der Tablet App) nach dem Laden der Termine ergänzen:

```js
  // Stempel-Daten laden und an Termine hängen
  const heute = new Date().toISOString().slice(0, 10);
  try {
    const stempelRes = await fetch(`${API_BASE}/stempelzeiten?datum=${heute}`);
    const stempelGruppen = await stempelRes.json();
    const stempelByTermin = {};
    for (const gruppe of stempelGruppen) {
      for (const a of gruppe.arbeiten) {
        if (!stempelByTermin[a.termin_id]) stempelByTermin[a.termin_id] = [];
        stempelByTermin[a.termin_id].push(a);
      }
    }
    for (const t of termine) {
      t.stempelMap = {};
      for (const s of (stempelByTermin[t.id] || [])) {
        t.stempelMap[s.arbeit] = s;
      }
    }
  } catch (e) {
    console.warn('[Stempel] Stempel-Daten konnten nicht geladen werden:', e);
  }
```

Dann `renderArbeitenMitStempel(termin, arbeiten, termin.stempelMap || {})` an der Stelle aufrufen wo bisher `renderArbeitenKompakt` oder die Arbeitsliste gerendert wird.

- [ ] **Schritt 4: Visuell testen**

Tablet App starten (`cd electron-intern-tablet && npm start`). Auftrags-Kacheln müssen Start/Ende-Buttons pro Arbeit zeigen.

- [ ] **Schritt 5: Commit**

```bash
git add electron-intern-tablet/index.html
git commit -m "feat: Tablet App - Stempel-Buttons pro Arbeit"
```

---

## Task 9: CLAUDE.md + PROJEKT.md aktualisieren

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/PROJEKT.md`

- [ ] **Schritt 1: CLAUDE.md — Route ergänzen**

In `CLAUDE.md`, Abschnitt 8 "Routen & Services", Tabelle ergänzen:

```
| `stempelzeitenRoutes.js` | Tagesübersicht Stempelzeiten, Stempel setzen |
```

- [ ] **Schritt 2: PROJEKT.md — DB-Tabelle ergänzen**

In `.claude/PROJEKT.md` unter "Datenmodell / DB-Tabellen":

```
termine_arbeiten.stempel_start TEXT — Tatsächliche Startzeit (HH:MM), NULL = nicht gestempelt
termine_arbeiten.stempel_ende  TEXT — Tatsächliche Endzeit  (HH:MM), NULL = nicht gestempelt
```

- [ ] **Schritt 3: Commit**

```bash
git add CLAUDE.md .claude/PROJEKT.md
git commit -m "docs: Zeitstempelung in CLAUDE.md und PROJEKT.md dokumentiert"
```

---

## Abschluss: Gesamttest

- [ ] Backend starten, alle Tests laufen lassen: `cd backend && npm test`
- [ ] Frontend bauen: `cd frontend && npm run build`
- [ ] Tab "Zeitstempelung" öffnen, Datum wählen → Tabelle erscheint
- [ ] Intern Tab: Start-Button drücken → Zeit erscheint grün → Zeitstempelung-Tab aktualisiert sich via WebSocket
- [ ] Plan Beta Tab: Zeitfeld manuell ausfüllen → Zeitstempelung-Tab zeigt den Wert
- [ ] Tablet App: Start-Button für Arbeit drücken → Wert in Zeitstempelung-Tab sichtbar
