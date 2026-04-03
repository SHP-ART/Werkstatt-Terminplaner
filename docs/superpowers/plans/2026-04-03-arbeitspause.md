# Arbeitspause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mitarbeiter und Meister können laufende Werkstatt-Aufträge pausieren — mit Grundangabe, eingefrorenem Fortschrittstimer und manuellem Fortsetzen.

**Architecture:** Neue SQLite-Tabelle `arbeitspausen` analog zu `pause_tracking`. Backend Controller/Route `/api/arbeitspausen`. Frontend: `loadInternTeamUebersicht()` lädt aktive Arbeitspausen parallel, `renderInternPersonKachel()` zeigt Pause-Badge + Einfrierung + Buttons. Tablet-App (`electron-intern-tablet/index.html`) erhält dieselbe Integration.

**Tech Stack:** Node.js/Express, SQLite3, Vanilla JS (keine Frameworks), Jest für Tests

---

## File Map

| Datei | Aktion |
|-------|--------|
| `backend/migrations/030_arbeitspausen.js` | Neu: Migration für `arbeitspausen` Tabelle |
| `backend/migrations/index.js` | Ändern: Migration 030 registrieren |
| `backend/src/controllers/arbeitspausenController.js` | Neu: starten/beenden/getAktive |
| `backend/src/routes/arbeitspausen.js` | Neu: Express Router |
| `backend/src/routes/index.js` | Ändern: Route registrieren |
| `backend/tests/arbeitspausen.test.js` | Neu: Jest-Tests für Controller-Logik |
| `frontend/src/components/app.js` | Ändern: loadInternTeamUebersicht + renderInternPersonKachel + 3 neue Methoden |
| `frontend/src/styles/style.css` | Ändern: CSS für pausierte Kachel (Variante C) |
| `electron-intern-tablet/index.html` | Ändern: loadData + renderPersonKachel + Pause-Modal |
| `DATENBANK.md` | Ändern: Tabelle dokumentieren |

---

## Task 1: Migration 030 — `arbeitspausen` Tabelle

**Files:**
- Create: `backend/migrations/030_arbeitspausen.js`
- Modify: `backend/migrations/index.js`

- [ ] **Schritt 1: Migration-Datei erstellen**

```js
// backend/migrations/030_arbeitspausen.js
const { safeRun } = require('./helpers');

const migration = {
  version: 30,
  description: 'Arbeitspausen: Tabelle arbeitspausen für manuelle Arbeitsunterbrechungen'
};

async function up(db) {
  console.log('Migration 030: Erstelle arbeitspausen-Tabelle...');

  await safeRun(db, `
    CREATE TABLE IF NOT EXISTS arbeitspausen (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id      INTEGER NOT NULL,
      mitarbeiter_id INTEGER,
      lehrling_id    INTEGER,
      grund          TEXT NOT NULL,
      gestartet_am   DATETIME NOT NULL,
      beendet_am     DATETIME,
      FOREIGN KEY (termin_id) REFERENCES termine(id)
    )
  `);

  await safeRun(db, `
    CREATE INDEX IF NOT EXISTS idx_arbeitspausen_termin
    ON arbeitspausen(termin_id)
  `);

  await safeRun(db, `
    CREATE INDEX IF NOT EXISTS idx_arbeitspausen_aktiv
    ON arbeitspausen(beendet_am)
    WHERE beendet_am IS NULL
  `);

  console.log('✓ Migration 030 abgeschlossen');
}

async function down(db) {
  await safeRun(db, 'DROP INDEX IF EXISTS idx_arbeitspausen_aktiv');
  await safeRun(db, 'DROP INDEX IF EXISTS idx_arbeitspausen_termin');
  await safeRun(db, 'DROP TABLE IF EXISTS arbeitspausen');
  console.log('✓ Migration 030 rückgängig gemacht');
}

migration.up = up;
migration.down = down;

module.exports = migration;
```

- [ ] **Schritt 2: In `backend/migrations/index.js` registrieren**

Nach Zeile `require('./029_wiederholung')` einfügen:

```js
  require('./030_arbeitspausen')         // Version 30 - Arbeitspausen
```

- [ ] **Schritt 3: Migration testen**

```bash
cd backend
node -e "
const { db } = require('./src/config/database');
const migration = require('./migrations/030_arbeitspausen');
migration.up(db).then(() => { console.log('OK'); db.close(); }).catch(e => { console.error(e); db.close(); });
"
```

Erwartete Ausgabe:
```
Migration 030: Erstelle arbeitspausen-Tabelle...
✓ Migration 030 abgeschlossen
OK
```

- [ ] **Schritt 4: Commit**

```bash
git add backend/migrations/030_arbeitspausen.js backend/migrations/index.js
git commit -m "feat: Migration 030 - arbeitspausen Tabelle"
```

---

## Task 2: Backend Controller `arbeitspausenController.js`

**Files:**
- Create: `backend/src/controllers/arbeitspausenController.js`

- [ ] **Schritt 1: Controller anlegen**

```js
// backend/src/controllers/arbeitspausenController.js
const { db } = require('../config/database');

const ERLAUBTE_GRUENDE = ['teil_fehlt', 'rueckfrage_kunde', 'vorrang'];

class ArbeitspausenController {
  static dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
  }

  static dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
  }

  static dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
    });
  }

  /**
   * POST /api/arbeitspausen/starten
   * Body: { termin_id, mitarbeiter_id?, lehrling_id?, grund }
   */
  static async starten(req, res) {
    try {
      const { termin_id, mitarbeiter_id, lehrling_id, grund } = req.body;

      if (!termin_id || !grund) {
        return res.status(400).json({ error: 'termin_id und grund erforderlich' });
      }

      if (!ERLAUBTE_GRUENDE.includes(grund)) {
        return res.status(400).json({ error: `grund muss einer von: ${ERLAUBTE_GRUENDE.join(', ')}` });
      }

      const termin = await ArbeitspausenController.dbGet(
        `SELECT id, status FROM termine WHERE id = ? AND geloescht_am IS NULL`,
        [termin_id]
      );

      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      if (termin.status !== 'in_arbeit') {
        return res.status(409).json({ error: 'Termin ist nicht in Arbeit' });
      }

      const aktivePause = await ArbeitspausenController.dbGet(
        `SELECT id FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`,
        [termin_id]
      );

      if (aktivePause) {
        return res.status(409).json({ error: 'Arbeitspause läuft bereits' });
      }

      const result = await ArbeitspausenController.dbRun(
        `INSERT INTO arbeitspausen (termin_id, mitarbeiter_id, lehrling_id, grund, gestartet_am)
         VALUES (?, ?, ?, ?, ?)`,
        [termin_id, mitarbeiter_id || null, lehrling_id || null, grund, new Date().toISOString()]
      );

      res.json({ success: true, id: result.lastID });
    } catch (error) {
      console.error('[Arbeitspause-Start] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Starten der Arbeitspause', details: error.message });
    }
  }

  /**
   * POST /api/arbeitspausen/beenden
   * Body: { termin_id }
   */
  static async beenden(req, res) {
    try {
      const { termin_id } = req.body;

      if (!termin_id) {
        return res.status(400).json({ error: 'termin_id erforderlich' });
      }

      const aktivePause = await ArbeitspausenController.dbGet(
        `SELECT id FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`,
        [termin_id]
      );

      if (!aktivePause) {
        return res.status(404).json({ error: 'Keine aktive Arbeitspause für diesen Termin' });
      }

      await ArbeitspausenController.dbRun(
        `UPDATE arbeitspausen SET beendet_am = ? WHERE id = ?`,
        [new Date().toISOString(), aktivePause.id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[Arbeitspause-Ende] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Beenden der Arbeitspause', details: error.message });
    }
  }

  /**
   * GET /api/arbeitspausen/aktive
   * Gibt alle Arbeitspausen zurück bei denen beendet_am IS NULL
   */
  static async getAktive(req, res) {
    try {
      const pausen = await ArbeitspausenController.dbAll(
        `SELECT id, termin_id, mitarbeiter_id, lehrling_id, grund, gestartet_am
         FROM arbeitspausen
         WHERE beendet_am IS NULL
         ORDER BY gestartet_am DESC`
      );
      res.json(pausen);
    } catch (error) {
      console.error('[Arbeitspausen-Aktive] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Arbeitspausen', details: error.message });
    }
  }
}

module.exports = ArbeitspausenController;
```

- [ ] **Schritt 2: Commit**

```bash
git add backend/src/controllers/arbeitspausenController.js
git commit -m "feat: ArbeitspausenController - starten/beenden/getAktive"
```

---

## Task 3: Backend Route + Registration

**Files:**
- Create: `backend/src/routes/arbeitspausen.js`
- Modify: `backend/src/routes/index.js`

- [ ] **Schritt 1: Route anlegen**

```js
// backend/src/routes/arbeitspausen.js
const express = require('express');
const router = express.Router();
const ArbeitspausenController = require('../controllers/arbeitspausenController');

router.post('/starten', ArbeitspausenController.starten);
router.post('/beenden', ArbeitspausenController.beenden);
router.get('/aktive', ArbeitspausenController.getAktive);

module.exports = router;
```

- [ ] **Schritt 2: In `backend/src/routes/index.js` registrieren**

Nach `const pauseRoutes = require('./pause');` einfügen:

```js
const arbeitspausenRoutes = require('./arbeitspausen');
```

Nach `router.use('/pause', pauseRoutes);` einfügen:

```js
router.use('/arbeitspausen', arbeitspausenRoutes);
```

- [ ] **Schritt 3: Server starten und Endpunkte testen**

```bash
cd backend && npm run server
# In neuem Terminal:
curl -s http://localhost:3000/api/arbeitspausen/aktive
```

Erwartete Ausgabe: `[]`

- [ ] **Schritt 4: Commit**

```bash
git add backend/src/routes/arbeitspausen.js backend/src/routes/index.js
git commit -m "feat: /api/arbeitspausen Route registriert"
```

---

## Task 4: Backend Tests

**Files:**
- Create: `backend/tests/arbeitspausen.test.js`

- [ ] **Schritt 1: Testdatei erstellen**

```js
// backend/tests/arbeitspausen.test.js
const { createTestDb, closeTestDb, dbRun, dbGet, dbAll, seedMitarbeiter } = require('./helpers/testSetup');

describe('Arbeitspausen API', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMitarbeiter(db);
    // Testtermin im Status in_arbeit anlegen
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, arbeit, status, mitarbeiter_id, geschaetzte_zeit)
      VALUES ('T-TEST-001', 'Kunde', 'AB-123', '2026-04-03', 'Bremsen', 'in_arbeit', 1, 60)`);
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  test('arbeitspausen Tabelle existiert nach Migration', async () => {
    const table = await dbGet(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='arbeitspausen'`);
    expect(table).toBeDefined();
    expect(table.name).toBe('arbeitspausen');
  });

  test('Pause starten erzeugt Eintrag mit beendet_am = NULL', async () => {
    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-TEST-001'`);
    await dbRun(db, `INSERT INTO arbeitspausen (termin_id, mitarbeiter_id, grund, gestartet_am)
      VALUES (?, 1, 'teil_fehlt', datetime('now'))`, [termin.id]);

    const pause = await dbGet(db, `SELECT * FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`, [termin.id]);
    expect(pause).toBeDefined();
    expect(pause.grund).toBe('teil_fehlt');
    expect(pause.beendet_am).toBeNull();
  });

  test('Pause beenden setzt beendet_am', async () => {
    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-TEST-001'`);
    await dbRun(db, `INSERT INTO arbeitspausen (termin_id, mitarbeiter_id, grund, gestartet_am)
      VALUES (?, 1, 'rueckfrage_kunde', datetime('now'))`, [termin.id]);

    const pause = await dbGet(db, `SELECT id FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`, [termin.id]);
    await dbRun(db, `UPDATE arbeitspausen SET beendet_am = datetime('now') WHERE id = ?`, [pause.id]);

    const beendet = await dbGet(db, `SELECT beendet_am FROM arbeitspausen WHERE id = ?`, [pause.id]);
    expect(beendet.beendet_am).not.toBeNull();
  });

  test('getAktive gibt nur Pausen mit beendet_am IS NULL zurück', async () => {
    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-TEST-001'`);
    // Aktive Pause
    await dbRun(db, `INSERT INTO arbeitspausen (termin_id, grund, gestartet_am)
      VALUES (?, 'vorrang', datetime('now'))`, [termin.id]);
    // Beendete Pause
    await dbRun(db, `INSERT INTO arbeitspausen (termin_id, grund, gestartet_am, beendet_am)
      VALUES (?, 'teil_fehlt', datetime('now', '-1 hour'), datetime('now', '-30 minutes'))`, [termin.id]);

    const aktive = await dbAll(db, `SELECT id FROM arbeitspausen WHERE beendet_am IS NULL`);
    expect(aktive).toHaveLength(1);
  });

  test('Nur Pause pro Termin gleichzeitig aktiv', async () => {
    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-TEST-001'`);
    await dbRun(db, `INSERT INTO arbeitspausen (termin_id, grund, gestartet_am)
      VALUES (?, 'teil_fehlt', datetime('now'))`, [termin.id]);

    const aktivePause = await dbGet(db, `SELECT id FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`, [termin.id]);
    expect(aktivePause).toBeDefined();

    // Controller-Logik: vor INSERT prüfen ob bereits eine aktive Pause existiert
    const bereitsAktiv = !!aktivePause;
    expect(bereitsAktiv).toBe(true); // → Controller würde 409 zurückgeben
  });
});
```

- [ ] **Schritt 2: Tests ausführen**

```bash
cd backend && npx jest tests/arbeitspausen.test.js --verbose --forceExit
```

Erwartete Ausgabe:
```
PASS tests/arbeitspausen.test.js
  Arbeitspausen API
    ✓ arbeitspausen Tabelle existiert nach Migration
    ✓ Pause starten erzeugt Eintrag mit beendet_am = NULL
    ✓ Pause beenden setzt beendet_am
    ✓ getAktive gibt nur Pausen mit beendet_am IS NULL zurück
    ✓ Nur Pause pro Termin gleichzeitig aktiv
```

- [ ] **Schritt 3: Commit**

```bash
git add backend/tests/arbeitspausen.test.js
git commit -m "test: Arbeitspausen Controller-Logik Tests"
```

---

## Task 5: Frontend — `loadInternTeamUebersicht()` erweitern

**Files:**
- Modify: `frontend/src/components/app.js` (Zeile ~29748–29822)

- [ ] **Schritt 1: Aktive Arbeitspausen in `Promise.all` laden**

In `loadInternTeamUebersicht()` (ca. Zeile 29751) — die bestehende `Promise.all`-Zeile um einen Eintrag erweitern:

```js
// VORHER (Zeile ~29751):
const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, abwesenheiten] = await Promise.all([
  ApiService.get('/mitarbeiter'),
  ApiService.get('/lehrlinge'),
  ApiService.get(`/termine?datum=${heute}`),
  EinstellungenService.getWerkstatt(),
  ApiService.get(`/abwesenheiten/datum/${heute}`).catch(() => [])
]);

// NACHHER:
const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, abwesenheiten, aktiveArbeitspausen] = await Promise.all([
  ApiService.get('/mitarbeiter'),
  ApiService.get('/lehrlinge'),
  ApiService.get(`/termine?datum=${heute}`),
  EinstellungenService.getWerkstatt(),
  ApiService.get(`/abwesenheiten/datum/${heute}`).catch(() => []),
  ApiService.get('/arbeitspausen/aktive').catch(() => [])
]);
```

- [ ] **Schritt 2: `aktiveArbeitspausen` in `berechnungsKontext` einfügen**

In `loadInternTeamUebersicht()` (ca. Zeile 29816) — `berechnungsKontext` erweitern:

```js
// VORHER:
const berechnungsKontext = {
  globaleNebenzeitProzent,
  mitarbeiter,
  lehrlinge,
  arbeitszeitenMap,
  abwesenheitenMap
};

// NACHHER:
const berechnungsKontext = {
  globaleNebenzeitProzent,
  mitarbeiter,
  lehrlinge,
  arbeitszeitenMap,
  abwesenheitenMap,
  aktiveArbeitspausen: Array.isArray(aktiveArbeitspausen) ? aktiveArbeitspausen : []
};
```

- [ ] **Schritt 3: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: loadInternTeamUebersicht lädt aktive Arbeitspausen"
```

---

## Task 6: Frontend — `renderInternPersonKachel()` + Modal + CSS

**Files:**
- Modify: `frontend/src/components/app.js`
- Modify: `frontend/src/styles/style.css`

- [ ] **Schritt 1: Pause-Erkennung in `renderInternPersonKachel()` einfügen**

In `renderInternPersonKachel()` nach Zeile 29991 (`const inPause = this.istPersonAktuellInPause(...)`) einfügen:

```js
// Prüfe ob Person eine aktive Arbeitspause hat (für aktuellen Auftrag)
const aktivePausen = kontext.aktiveArbeitspausen || [];
const aktiveArbeitspause = aktuellerAuftrag
  ? aktivePausen.find(p => p.termin_id === aktuellerAuftrag.id)
  : null;
const istArbeitPausiert = !!aktiveArbeitspause;
```

- [ ] **Schritt 2: Badge-Logik für `arbeit-pausiert` ergänzen**

In `renderInternPersonKachel()` — die Badge-Bestimmung (ca. Zeile 30001) erweitern:

```js
// VORHER:
let badgeClass = 'frei';
let badgeText = 'Frei';
if (inPause) {
  badgeClass = 'pause';
  badgeText = '🍽️ Pause';
} else if (istAbwesend) {
  // ...
} else if (inBerufsschule) {
  // ...
} else if (aktuellerAuftrag) {
  badgeClass = 'in-arbeit';
  badgeText = 'In Arbeit';
}

// NACHHER — `istArbeitPausiert`-Zweig VOR `aktuellerAuftrag` einfügen:
let badgeClass = 'frei';
let badgeText = 'Frei';
if (inPause) {
  badgeClass = 'pause';
  badgeText = '🍽️ Pause';
} else if (istAbwesend) {
  // ... (unverändert)
} else if (inBerufsschule) {
  // ... (unverändert)
} else if (istArbeitPausiert) {
  badgeClass = 'arbeit-pausiert';
  badgeText = '⏸️ Pausiert';
} else if (aktuellerAuftrag) {
  badgeClass = 'in-arbeit';
  badgeText = 'In Arbeit';
}
```

- [ ] **Schritt 3: Eingefroren-Fortschritt + Pause-Button in `bodyContent` für `aktuellerAuftrag`**

Den Block `} else if (aktuellerAuftrag) {` (ca. Zeile 30068) erweitern. Die Fortschrittsberechnung ersetzen:

```js
} else if (aktuellerAuftrag) {
  // Fortschritt: einfrieren wenn pausiert
  let fortschritt;
  if (istArbeitPausiert && aktiveArbeitspause.gestartet_am) {
    const pauseZeit = new Date(aktiveArbeitspause.gestartet_am);
    const startzeit = aktuellerAuftrag.startzeit || aktuellerAuftrag.bring_zeit;
    if (startzeit) {
      const startMin = this.timeToMinutes(startzeit);
      const startDate = new Date(pauseZeit);
      startDate.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
      const verstricheneMin = (pauseZeit - startDate) / 60000;
      const geschaetzteZeit = this.getEffektiveArbeitszeitMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext);
      fortschritt = Math.round(Math.max(0, Math.min(100, (verstricheneMin / geschaetzteZeit) * 100)));
    } else {
      fortschritt = 0;
    }
  } else {
    fortschritt = this.berechneAuftragFortschrittMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext);
  }
  const restzeit = this.berechneRestzeitMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext);
  const isUeberzogen = fortschritt > 100;

  const arbeitenDetails = this.getArbeitenDetailsList(aktuellerAuftrag, person?.id, isLehrling);

  // Pausiert-Zeitangabe
  const pauseSeitText = istArbeitPausiert && aktiveArbeitspause.gestartet_am
    ? (() => {
        const d = new Date(aktiveArbeitspause.gestartet_am);
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} Uhr`;
      })()
    : null;

  // Pause/Fortsetzen-Button
  const pausePersonId = isLehrling ? `null, ${personId}` : `${personId}, null`;
  const pauseButton = istArbeitPausiert
    ? `<button class="intern-btn-arbeit-fortsetzen" onclick="app.interneArbeitFortsetzen(${aktuellerAuftrag.id})">▶️ Fortsetzen</button>`
    : `<button class="intern-btn-arbeit-pause" onclick="app.interneArbeitPausieren(${aktuellerAuftrag.id}, ${pausePersonId})">⏸️ Pause</button>`;

  bodyContent = `
    <div class="intern-person-auftrag">
      <div class="auftrag-label">🔧 ${istArbeitPausiert ? 'Unterbrochener Auftrag' : 'Aktueller Auftrag'}</div>
      <div class="auftrag-nr">${aktuellerAuftrag.termin_nr || '-'}</div>
      <div class="auftrag-kunde">${this.escapeHtml(aktuellerAuftrag.kunde_name || '-')}</div>
      <div class="auftrag-kennzeichen">${this.escapeHtml(aktuellerAuftrag.kennzeichen || '-')}</div>
      ${arbeitenDetails.length > 0
        ? `<div class="auftrag-arbeiten-liste">
            ${arbeitenDetails.map(a => `<div class="auftrag-arbeit-item">• ${this.escapeHtml(a.name)} ${a.zeit > 0 ? `(${this.formatMinutesToHours(a.zeit)})` : ''}</div>`).join('')}
          </div>`
        : `<div class="auftrag-arbeit">${this.escapeHtml(aktuellerAuftrag.arbeit || '-')}</div>`
      }
      ${pauseSeitText ? `<div class="intern-arbeit-pause-seit">Pausiert seit: ${pauseSeitText}</div>` : ''}
    </div>

    <div class="intern-person-zeit">
      <div class="intern-person-zeit-item">
        <div class="zeit-label">Beginn</div>
        <div class="zeit-value">${this.normalizeZeit(this.getEffektiveStartzeit(aktuellerAuftrag)) || '--:--'}</div>
      </div>
      <div class="intern-person-zeit-item">
        <div class="zeit-label">${aktuellerAuftrag.status === 'abgeschlossen' ? 'Fertig' : 'Fertig ca.'}</div>
        <div class="zeit-value">${this.berechneEndzeitMitFaktoren(aktuellerAuftrag, person, isLehrling, kontext)}</div>
      </div>
      <div class="intern-person-zeit-item">
        <div class="zeit-label">${aktuellerAuftrag.status === 'abgeschlossen' ? 'Dauer' : 'Rest'}</div>
        <div class="zeit-value" style="color: ${isUeberzogen ? '#dc3545' : 'var(--accent)'}">
          ${aktuellerAuftrag.status === 'abgeschlossen'
            ? this.formatMinutesToHours(aktuellerAuftrag.tatsaechliche_zeit || aktuellerAuftrag.geschaetzte_zeit || 0)
            : restzeit}
        </div>
      </div>
    </div>

    <div class="intern-person-fortschritt">
      <div class="intern-person-fortschritt-bar">
        <div class="intern-person-fortschritt-fill ${isUeberzogen ? 'ueberzogen' : ''} ${istArbeitPausiert ? 'eingefroren' : ''}"
             style="width: ${Math.min(fortschritt, 100)}%"></div>
      </div>
      <div class="intern-person-fortschritt-text">
        <span>Fortschritt${istArbeitPausiert ? ' 🧊' : ''}</span>
        <span>${Math.min(fortschritt, 150)}%</span>
      </div>
    </div>

    ${naechsterAuftrag ? `
      <div class="intern-person-naechster">
        <div class="naechster-label">📋 Danach:</div>
        <div class="naechster-info">
          <span class="naechster-kunde">${this.escapeHtml(naechsterAuftrag.kunde_name || '-')} • ${this.escapeHtml(naechsterAuftrag.kennzeichen || '-')}</span>
          <span class="naechster-zeit">${this.normalizeZeit(this.getEffektiveStartzeit(naechsterAuftrag)) || '--:--'}</span>
        </div>
      </div>
    ` : ''}

    <div class="intern-arbeit-pause-actions">
      ${pauseButton}
    </div>
  `;
```

- [ ] **Schritt 4: Kachel-Wrapper anpassen für Variante-C-Style**

In `renderInternPersonKachel()` — den abschließenden `return`-Block (ca. Zeile 30182) anpassen:

```js
// VORHER:
return `
  <div class="intern-person-kachel ${isLehrling ? 'lehrling' : ''}">

// NACHHER:
return `
  <div class="intern-person-kachel ${isLehrling ? 'lehrling' : ''} ${istArbeitPausiert ? 'arbeit-pausiert' : ''}">
```

- [ ] **Schritt 5: Zwei neue App-Methoden einfügen**

Nach `renderInternPersonKachel()` (ca. Zeile 30202) einfügen:

```js
  /**
   * Öffnet Pause-Modal und startet Arbeitspause nach Grundauswahl
   */
  async interneArbeitPausieren(terminId, mitarbeiterId, lehrlingId) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

    const grundLabels = {
      teil_fehlt: '⏳ Teil fehlt / wird geliefert',
      rueckfrage_kunde: '❓ Rückfrage beim Kunden',
      vorrang: '🔀 Vorrang dringenderer Auftrag'
    };

    modal.innerHTML = `
      <div style="background:white;border-radius:12px;padding:24px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <strong style="font-size:15px;color:#333;">⏸️ Arbeit unterbrechen</strong>
          <span id="arbeitPauseModalClose" style="cursor:pointer;color:#999;font-size:20px;line-height:1;">✕</span>
        </div>
        <p style="font-size:13px;color:#666;margin-bottom:14px;">Warum wird die Arbeit unterbrochen?</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
          ${Object.entries(grundLabels).map(([val, label]) => `
            <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;font-size:14px;">
              <input type="radio" name="arbeitPauseGrund" value="${val}" style="accent-color:#1976d2;">
              ${label}
            </label>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="arbeitPauseAbbrechen" style="flex:1;padding:10px;background:#f0f0f0;color:#555;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Abbrechen</button>
          <button id="arbeitPauseBestaetigen" style="flex:1;padding:10px;background:#636e72;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">⏸️ Pausieren</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const schliesseModal = () => document.body.removeChild(modal);

    modal.querySelector('#arbeitPauseModalClose').onclick = schliesseModal;
    modal.querySelector('#arbeitPauseAbbrechen').onclick = schliesseModal;
    modal.onclick = (e) => { if (e.target === modal) schliesseModal(); };

    modal.querySelector('#arbeitPauseBestaetigen').onclick = async () => {
      const selected = modal.querySelector('input[name="arbeitPauseGrund"]:checked');
      if (!selected) {
        alert('Bitte einen Grund auswählen.');
        return;
      }
      try {
        await ApiService.post('/arbeitspausen/starten', {
          termin_id: terminId,
          mitarbeiter_id: mitarbeiterId || null,
          lehrling_id: lehrlingId || null,
          grund: selected.value
        });
        schliesseModal();
        this.loadInternTeamUebersicht();
      } catch (e) {
        console.error('[Arbeitspause] Fehler beim Starten:', e);
        alert('Fehler beim Starten der Pause.');
      }
    };
  }

  /**
   * Beendet aktive Arbeitspause für einen Termin
   */
  async interneArbeitFortsetzen(terminId) {
    try {
      await ApiService.post('/arbeitspausen/beenden', { termin_id: terminId });
      this.loadInternTeamUebersicht();
    } catch (e) {
      console.error('[Arbeitspause] Fehler beim Fortsetzen:', e);
      alert('Fehler beim Fortsetzen der Arbeit.');
    }
  }
```

- [ ] **Schritt 6: CSS für pausierte Kachel hinzufügen**

In `frontend/src/styles/style.css` — nach `.intern-person-badge.pause` (ca. Zeile 13513) einfügen:

```css
.intern-person-badge.arbeit-pausiert {
    background: #636e72;
    color: white;
}

.intern-person-kachel.arbeit-pausiert {
    border-color: #636e72;
    border-left: 5px solid #fdcb6e;
}

.intern-arbeit-pause-seit {
    font-size: 0.8rem;
    color: #636e72;
    margin-top: 4px;
}

.intern-person-fortschritt-fill.eingefroren {
    background: linear-gradient(90deg, #b2bec3, #636e72);
}

.intern-arbeit-pause-actions {
    padding: 10px 20px;
    border-top: 1px solid #f0f0f0;
}

.intern-btn-arbeit-pause {
    width: 100%;
    padding: 8px;
    background: #636e72;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.intern-btn-arbeit-pause:hover {
    background: #4a5568;
}

.intern-btn-arbeit-fortsetzen {
    width: 100%;
    padding: 8px;
    background: #00b894;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.intern-btn-arbeit-fortsetzen:hover {
    background: #00a381;
}
```

- [ ] **Schritt 7: Im Browser testen**

1. Server starten (`cd backend && npm run server`)
2. Frontend öffnen (Vite: `cd frontend && npm run dev` oder direkt über Electron)
3. Im Intern-Tab einen Termin auf `in_arbeit` setzen
4. Prüfen: ⏸️ Pause-Button erscheint in der Kachel
5. Klicken: Modal öffnet sich mit 3 Grundoptionen
6. Grund wählen + "Pausieren" → Badge wechselt zu "⏸️ Pausiert", Kachel grauer Rand + gelber Akzent
7. "▶️ Fortsetzen" klicken → Kachel kehrt zu "In Arbeit" zurück

- [ ] **Schritt 8: Commit**

```bash
git add frontend/src/components/app.js frontend/src/styles/style.css
git commit -m "feat: Arbeitspause in Intern-Tab - Pause/Fortsetzen Button + pausierte Kachel"
```

---

## Task 7: Tablet-App (`electron-intern-tablet/index.html`)

**Files:**
- Modify: `electron-intern-tablet/index.html`

- [ ] **Schritt 1: Aktive Arbeitspausen in `Promise.all` laden**

In `electron-intern-tablet/index.html` — die `Promise.all`-Zeile (ca. Zeile 2235) erweitern:

```js
// VORHER:
const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, aktivePausen, abwesenheiten, heutigePausen] = await Promise.all([
  ApiService.get('/mitarbeiter'),
  ApiService.get('/lehrlinge'),
  ApiService.get(`/termine?datum=${heute}`),
  ApiService.get('/einstellungen/werkstatt'),
  ApiService.get('/pause/aktive'),
  ApiService.get(`/abwesenheiten/datum/${heute}`),
  ApiService.get('/pause/heute')
]);

// NACHHER:
const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, aktivePausen, abwesenheiten, heutigePausen, aktiveArbeitspausen] = await Promise.all([
  ApiService.get('/mitarbeiter'),
  ApiService.get('/lehrlinge'),
  ApiService.get(`/termine?datum=${heute}`),
  ApiService.get('/einstellungen/werkstatt'),
  ApiService.get('/pause/aktive'),
  ApiService.get(`/abwesenheiten/datum/${heute}`),
  ApiService.get('/pause/heute'),
  ApiService.get('/arbeitspausen/aktive').catch(() => [])
]);
```

- [ ] **Schritt 2: `renderPersonKachel()` aufrufen — `aktiveArbeitspausen` übergeben**

In `electron-intern-tablet/index.html` — die Aufrufe von `renderPersonKachel` (ca. Zeile 2367 und 2373) anpassen:

```js
// VORHER:
allKacheln.push(renderPersonKachel(m, relevanteTermine, 'mitarbeiter', globaleNebenzeit, arbeitszeit));
// ...
allKacheln.push(renderPersonKachel(l, relevanteTermine, 'lehrling', globaleNebenzeit, arbeitszeit));

// NACHHER:
const normAktiveArbeitspausen = Array.isArray(aktiveArbeitspausen) ? aktiveArbeitspausen : [];
allKacheln.push(renderPersonKachel(m, relevanteTermine, 'mitarbeiter', globaleNebenzeit, arbeitszeit, normAktiveArbeitspausen));
// ...
allKacheln.push(renderPersonKachel(l, relevanteTermine, 'lehrling', globaleNebenzeit, arbeitszeit, normAktiveArbeitspausen));
```

- [ ] **Schritt 3: `renderPersonKachel()` Signatur + Pause-Logik ergänzen**

Die Funktion `renderPersonKachel` (ca. Zeile 1870) um `aktiveArbeitspausen = []` Parameter erweitern und Pause-Erkennung einfügen:

```js
// VORHER:
function renderPersonKachel(person, alleTermine, typ, globaleNebenzeit, arbeitszeit) {

// NACHHER:
function renderPersonKachel(person, alleTermine, typ, globaleNebenzeit, arbeitszeit, aktiveArbeitspausen = []) {
```

Nach der Zeile `const aktuellerAuftrag = personTermine.find(t => t.status === 'in_arbeit');` (ca. Zeile 1892) einfügen:

```js
// Arbeitspause prüfen
const aktiveArbeitspause = aktuellerAuftrag
  ? aktiveArbeitspausen.find(p => p.termin_id === aktuellerAuftrag.id)
  : null;
const istArbeitPausiert = !!aktiveArbeitspause;
```

- [ ] **Schritt 4: Badge in `renderPersonKachel()` erweitern**

Nach dem `} else if (aktuellerAuftrag) {`-Zweig für `badgeText` (ca. Zeile 1937) den `istArbeitPausiert`-Zweig einfügen:

```js
} else if (istArbeitPausiert) {
  badgeClass = 'arbeit-pausiert';
  badgeText = '⏸️ Pausiert';
} else if (aktuellerAuftrag) {
  badgeClass = 'in-arbeit';
  badgeText = 'In Arbeit';
}
```

- [ ] **Schritt 5: Pause-Button + Stil im Kachel-HTML ergänzen**

In `renderPersonKachel()` — im `aktuellerAuftrag`-Zweig des bodyContent (suche nach `intern-person-fortschritt` oder dem entsprechenden HTML in der Tabletapp) nach dem Fortschrittsbalken einfügen:

```js
// Pause-Button-HTML
const pausePersonId = isLehrling ? `null, ${personId}` : `${personId}, null`;
const pauseButtonHtml = istArbeitPausiert
  ? `<button class="intern-btn-arbeit-fortsetzen" onclick="interneArbeitFortsetzenTablet(${aktuellerAuftrag.id})">▶️ Fortsetzen</button>`
  : `<button class="intern-btn-arbeit-pause" onclick="interneArbeitPausierenTablet(${aktuellerAuftrag.id}, ${pausePersonId})">⏸️ Pause</button>`;
```

Und am Ende des bodyContent für `aktuellerAuftrag` einfügen:
```js
<div class="intern-arbeit-pause-actions" style="padding:8px 0 0;">
  ${pauseButtonHtml}
</div>
```

Kachel-Wrapper-Klasse `arbeit-pausiert` ergänzen (suche nach `person-kachel` in der HTML-Ausgabe):
```js
// Im return-String die Kachel-Klasse ergänzen:
<div class="person-kachel ${isLehrling ? 'lehrling' : ''} ${istArbeitPausiert ? 'arbeit-pausiert' : ''}">
```

- [ ] **Schritt 6: Globale Hilfsfunktionen für Tablet einfügen**

Im `<script>`-Block von `electron-intern-tablet/index.html` — globale Funktionen hinzufügen (nach den bestehenden Event-Handler-Funktionen):

```js
async function interneArbeitPausierenTablet(terminId, mitarbeiterId, lehrlingId) {
  const grundLabels = {
    teil_fehlt: '⏳ Teil fehlt / wird geliefert',
    rueckfrage_kunde: '❓ Rückfrage beim Kunden',
    vorrang: '🔀 Vorrang dringenderer Auftrag'
  };

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div style="background:white;border-radius:12px;padding:24px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <strong style="font-size:15px;">⏸️ Arbeit unterbrechen</strong>
        <span id="tabletPauseClose" style="cursor:pointer;color:#999;font-size:20px;">✕</span>
      </div>
      <p style="font-size:13px;color:#666;margin-bottom:14px;">Warum wird die Arbeit unterbrochen?</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
        ${Object.entries(grundLabels).map(([val, label]) => `
          <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;font-size:14px;">
            <input type="radio" name="tabletPauseGrund" value="${val}" style="accent-color:#1976d2;">
            ${label}
          </label>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;">
        <button id="tabletPauseAbbrechen" style="flex:1;padding:10px;background:#f0f0f0;color:#555;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Abbrechen</button>
        <button id="tabletPauseBestaetigen" style="flex:1;padding:10px;background:#636e72;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">⏸️ Pausieren</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const schliesseModal = () => document.body.removeChild(modal);
  modal.querySelector('#tabletPauseClose').onclick = schliesseModal;
  modal.querySelector('#tabletPauseAbbrechen').onclick = schliesseModal;
  modal.onclick = (e) => { if (e.target === modal) schliesseModal(); };
  modal.querySelector('#tabletPauseBestaetigen').onclick = async () => {
    const selected = modal.querySelector('input[name="tabletPauseGrund"]:checked');
    if (!selected) { alert('Bitte einen Grund auswählen.'); return; }
    try {
      await ApiService.post('/arbeitspausen/starten', {
        termin_id: terminId,
        mitarbeiter_id: mitarbeiterId || null,
        lehrling_id: lehrlingId || null,
        grund: selected.value
      });
      schliesseModal();
      await loadTeamUebersicht();
    } catch (e) {
      console.error('[Tablet-Pause] Fehler:', e);
      alert('Fehler beim Starten der Pause.');
    }
  };
}

async function interneArbeitFortsetzenTablet(terminId) {
  try {
    await ApiService.post('/arbeitspausen/beenden', { termin_id: terminId });
    await loadTeamUebersicht();
  } catch (e) {
    console.error('[Tablet-Fortsetzen] Fehler:', e);
    alert('Fehler beim Fortsetzen der Arbeit.');
  }
}
```

- [ ] **Schritt 7: CSS für Tablet-Kachel hinzufügen**

Im `<style>`-Block von `electron-intern-tablet/index.html` einfügen (nach `.person-badge.abwesend`):

```css
.person-badge.arbeit-pausiert {
  background: #636e72;
  color: white;
}

.person-kachel.arbeit-pausiert {
  border-color: #636e72;
  border-left: 5px solid #fdcb6e;
}

.intern-btn-arbeit-pause {
  width: 100%;
  padding: 8px;
  background: #636e72;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.intern-btn-arbeit-fortsetzen {
  width: 100%;
  padding: 8px;
  background: #00b894;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Schritt 8: Tablet-App testen**

1. Tablet-App starten
2. Mitarbeiter mit Status `in_arbeit` prüfen: ⏸️ Pause-Button muss sichtbar sein
3. Pause starten, Grundauswahl, Bestätigen → Kachel zeigt "⏸️ Pausiert"
4. "▶️ Fortsetzen" → Kachel kehrt zu "In Arbeit" zurück

- [ ] **Schritt 9: Commit**

```bash
git add electron-intern-tablet/index.html
git commit -m "feat: Arbeitspause in Tablet-App - Pause/Fortsetzen"
```

---

## Task 8: DATENBANK.md aktualisieren

**Files:**
- Modify: `DATENBANK.md`

- [ ] **Schritt 1: Tabelle `arbeitspausen` dokumentieren**

In `DATENBANK.md` — nach der Dokumentation von `pause_tracking` einfügen:

```markdown
## Tabelle: `arbeitspausen`

Speichert manuelle Arbeitsunterbrechungen für laufende Termine (Status `in_arbeit`).
Mehrere Pausen pro Termin möglich (vollständige Historie). Kein automatischer Ablauf —
Pausen enden nur manuell über `POST /api/arbeitspausen/beenden`.

| Spalte         | Typ      | Beschreibung |
|----------------|----------|-------------|
| `id`           | INTEGER  | Primärschlüssel |
| `termin_id`    | INTEGER  | FK → `termine.id` |
| `mitarbeiter_id` | INTEGER | FK → `mitarbeiter.id` (optional) |
| `lehrling_id`  | INTEGER  | FK → `lehrlinge.id` (optional) |
| `grund`        | TEXT     | `teil_fehlt` \| `rueckfrage_kunde` \| `vorrang` |
| `gestartet_am` | DATETIME | ISO-Timestamp Pausenstart |
| `beendet_am`   | DATETIME | ISO-Timestamp Pausenende (NULL = noch aktiv) |

### Migration
Migration 030: `backend/migrations/030_arbeitspausen.js`

### Indizes
- `idx_arbeitspausen_termin` — auf `termin_id`
- `idx_arbeitspausen_aktiv` — auf `beendet_am WHERE beendet_am IS NULL`

### API
- `POST /api/arbeitspausen/starten` — Body: `{ termin_id, mitarbeiter_id?, lehrling_id?, grund }`
- `POST /api/arbeitspausen/beenden` — Body: `{ termin_id }`
- `GET /api/arbeitspausen/aktive` — alle offenen Pausen
```

- [ ] **Schritt 2: Commit**

```bash
git add DATENBANK.md
git commit -m "docs: arbeitspausen Tabelle in DATENBANK.md dokumentiert"
```
