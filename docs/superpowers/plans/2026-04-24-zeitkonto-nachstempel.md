# Zeitkonto-Ampel & Tablet-Nachstempelung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Farb-Status-Punkte pro Tag im Zeitkonto (grün/gelb/orange/rot/blau) und ein Tablet-Dialog, der beim ersten Kommen-Stempel des nächsten Tages vergessene Stempelungen des letzten Soll-Tags abfragt.

**Architecture:** Backend-zentrale Status-Regel (reine Funktion `berechneTagesStatus`) wird vom erweiterten `/api/zeitkonto`-Endpunkt und drei neuen Endpunkten (`/nachstempel-check`, `/nachstempel`, `/nachstempel/dismiss`) benutzt. Re-Nag-Schutz über neue Spalte `tagesstempel.nachgefragt_am`. Frontend rendert Statuspunkte plus Inline-Bearbeitungs-Panel, Tablet-App ruft den Check direkt nach `/tagesstempel/kommen` auf.

**Tech Stack:** Node.js/Express + SQLite (CommonJS), Jest/Supertest, Vanilla JS Frontend, Electron-Tablet (ia32/Windows).

**Vollständige Spec:** [docs/superpowers/specs/2026-04-24-zeitkonto-nachstempel-design.md](../specs/2026-04-24-zeitkonto-nachstempel-design.md)

---

## ⚠ Prerequisites für Tests (Task 0)

Die bestehende Codebase testet **nur auf DB-Level** (siehe `backend/tests/arbeitspausen.test.js`, `stempelzeiten.test.js`). Es gibt **keine Supertest-/Controller-Level-Tests**. Einige Tasks in diesem Plan verwenden Supertest gegen die Controller — das bedingt, dass der `dbHelper` in Tests eine injizierbare DB akzeptiert.

**Option A (empfohlen):** Vor Task 3 eine minimale `setDb(testDb)`-Funktion in `backend/src/utils/dbHelper.js` ergänzen, die die bestehende Singleton-DB in Tests überschreibt:

```js
// Am Ende von dbHelper.js neben module.exports:
let _overrideDb = null;
function setDb(newDb) { _overrideDb = newDb; }
function getDb() { return _overrideDb || db; }
// Alle Helper (getAsync, allAsync, runAsync) müssen dann getDb() statt db verwenden.
```

**Option B (YAGNI-Variante):** Supertest-Tests in Task 3-6 durch **direkte DB-Assertions** ersetzen. D.h. statt `request(app).post(...)` direkt die Static-Methode mit `{ body, query }` als req aufrufen und DB-Zeilen danach prüfen.

Der ausführende Engineer entscheidet und dokumentiert die Wahl im ersten Task-Commit.

**Schema-Drift im Test-Setup:** `backend/tests/helpers/testSetup.js` hat eine Fallback-`abwesenheiten`-Tabelle mit `von_datum`/`bis_datum`, die echte DB nutzt `datum_von`/`datum_bis`. Wenn eine echte `backend/database/werkstatt.db` existiert, kopiert `createTestDb()` das richtige Schema. In Tests, die `abwesenheiten` brauchen, immer im `beforeEach` ein explizites `CREATE TABLE IF NOT EXISTS abwesenheiten (...)` mit korrekten Spaltennamen voranstellen, um robust zu sein.

---

## File Structure

**Neue Dateien:**
- `backend/migrations/036_nachgefragt_am.js` — Migration für neue Spalte + Nullable
- `backend/src/utils/tagesstatus.js` — Reine Funktion `berechneTagesStatus()` + `isSollTag()`
- `backend/tests/nachstempel.test.js` — Backend-Tests (12 Fälle)

**Modifiziert:**
- `backend/src/controllers/zeitkontoController.js` — Status-Felder in Response integrieren
- `backend/src/controllers/tagesstempelController.js` — 3 neue Handler: `nachstempelCheck`, `nachstempel`, `nachstempelDismiss`
- `backend/src/routes/tagesstempelRoutes.js` — 3 neue Routen
- `frontend/src/components/app.js` — `renderZeitkonto()` (Statuspunkt + Legende + Inline-Panel) + WebSocket-Handler
- `frontend/index.html` — Legenden-Block über `#zeitkontoContainer`
- `electron-intern-tablet/index.html` — `tagesstempelKommen()` erweitern + neue `showNachstempelDialog()`
- `electron-intern-tablet/package.json` — Version-Bump für Auto-Update

---

## Task 1: Migration 036 — nachgefragt_am + kommen_zeit nullable

**Files:**
- Create: `backend/migrations/036_nachgefragt_am.js`
- Test: `backend/tests/nachstempel.test.js` (Setup + erste Migration-Test-Case)

- [ ] **Step 1: Testdatei anlegen und Migration-Smoke-Test schreiben**

Erstelle `backend/tests/nachstempel.test.js`:

```js
// backend/tests/nachstempel.test.js
const { createTestDb, closeTestDb, dbRun, dbGet, dbAll } = require('./helpers/testSetup');
const migration036 = require('../migrations/036_nachgefragt_am');

// Voraussetzung: tagesstempel-Tabelle existiert in Test-DB
async function ensureTagesstempelTable(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS tagesstempel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_id INTEGER,
    lehrling_id INTEGER,
    datum TEXT NOT NULL,
    kommen_zeit TEXT NOT NULL,
    gehen_zeit TEXT,
    kommen_quelle TEXT,
    gehen_quelle TEXT,
    erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL)
  )`);
}

describe('Migration 036 — nachgefragt_am', () => {
  let db;
  beforeEach(async () => {
    db = await createTestDb();
    await ensureTagesstempelTable(db);
  });
  afterEach(async () => { await closeTestDb(db); });

  test('fügt nachgefragt_am Spalte hinzu', async () => {
    await migration036.up(db);
    const cols = await dbAll(db, `PRAGMA table_info(tagesstempel)`);
    const nachgefragt = cols.find(c => c.name === 'nachgefragt_am');
    expect(nachgefragt).toBeDefined();
    expect(nachgefragt.type).toBe('TEXT');
  });

  test('macht kommen_zeit nullable', async () => {
    await migration036.up(db);
    const cols = await dbAll(db, `PRAGMA table_info(tagesstempel)`);
    const kommen = cols.find(c => c.name === 'kommen_zeit');
    expect(kommen.notnull).toBe(0);
  });

  test('initialisiert nachgefragt_am = erstellt_am für Bestand', async () => {
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, erstellt_am)
                     VALUES (1, '2026-04-23', '07:00', '2026-04-23 07:00:00')`);
    await migration036.up(db);
    const row = await dbGet(db, `SELECT nachgefragt_am, erstellt_am FROM tagesstempel WHERE mitarbeiter_id = 1`);
    expect(row.nachgefragt_am).toBe(row.erstellt_am);
  });
});
```

- [ ] **Step 2: Test laufen lassen (soll FAIL mit "Cannot find module '../migrations/036_nachgefragt_am'")**

Run: `cd backend && npm test -- nachstempel`
Expected: Import-Error oder Modul-Not-Found.

- [ ] **Step 3: Migration-Datei schreiben**

Erstelle `backend/migrations/036_nachgefragt_am.js`:

```js
const { safeRun } = require('./helpers');

const migration = {
  version: 36,
  description: 'Tagesstempel: nachgefragt_am + kommen_zeit nullable für Nachstempel-Feature'
};

async function up(db) {
  console.log('Migration 036: Füge nachgefragt_am hinzu + kommen_zeit nullable...');

  // 1. Neue Spalte hinzufügen (idempotent: safeRun ignoriert duplicate column)
  await safeRun(db, `ALTER TABLE tagesstempel ADD COLUMN nachgefragt_am TEXT DEFAULT NULL`);

  // 2. kommen_zeit auf nullable umstellen (SQLite: neue Tabelle + Copy + Rename)
  // Prüfen ob nötig (Idempotenz)
  const tableInfo = await new Promise((resolve) => {
    db.all(`PRAGMA table_info(tagesstempel)`, (err, rows) => resolve(rows || []));
  });
  const kommenSpalte = tableInfo.find(c => c.name === 'kommen_zeit');
  if (kommenSpalte && kommenSpalte.notnull === 1) {
    await safeRun(db, `
      CREATE TABLE tagesstempel_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        mitarbeiter_id INTEGER REFERENCES mitarbeiter(id) ON DELETE SET NULL,
        lehrling_id    INTEGER REFERENCES lehrlinge(id)   ON DELETE SET NULL,
        datum          TEXT NOT NULL,
        kommen_zeit    TEXT,
        gehen_zeit     TEXT,
        kommen_quelle  TEXT,
        gehen_quelle   TEXT,
        nachgefragt_am TEXT DEFAULT NULL,
        erstellt_am    TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL)
      )
    `);
    await safeRun(db, `
      INSERT INTO tagesstempel_new (id, mitarbeiter_id, lehrling_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am, erstellt_am)
      SELECT id, mitarbeiter_id, lehrling_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am, erstellt_am
      FROM tagesstempel
    `);
    await safeRun(db, `DROP TABLE tagesstempel`);
    await safeRun(db, `ALTER TABLE tagesstempel_new RENAME TO tagesstempel`);
    await safeRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_tagesstempel_ma_datum ON tagesstempel(mitarbeiter_id, datum) WHERE mitarbeiter_id IS NOT NULL`);
    await safeRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_tagesstempel_ll_datum ON tagesstempel(lehrling_id, datum) WHERE lehrling_id IS NOT NULL`);
  }

  // 3. Bestand initialisieren (nur NULL-Werte)
  await safeRun(db, `UPDATE tagesstempel SET nachgefragt_am = erstellt_am WHERE nachgefragt_am IS NULL`);

  console.log('✓ Migration 036 abgeschlossen');
}

async function down(db) {
  // SQLite unterstützt kein DROP COLUMN vor 3.35 — Spalte bleibt bestehen
  console.log('✓ Migration 036 rückgängig (nachgefragt_am bleibt, kommen_zeit bleibt nullable)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
```

- [ ] **Step 4: Test laufen lassen**

Run: `cd backend && npm test -- nachstempel`
Expected: 3 PASS in Migration-036-Block.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/036_nachgefragt_am.js backend/tests/nachstempel.test.js
git commit -m "feat(migration): 036 nachgefragt_am + kommen_zeit nullable"
```

---

## Task 2: Status-Berechnungs-Funktion `berechneTagesStatus`

Reine Funktion (keine DB-Zugriffe) für die Ampel-Logik. Testbar in Isolation.

**Files:**
- Create: `backend/src/utils/tagesstatus.js`
- Test: `backend/tests/nachstempel.test.js` (Block erweitern)

- [ ] **Step 1: Tests für alle 7 Ampel-Regeln schreiben**

Ans Ende von `backend/tests/nachstempel.test.js` anhängen:

```js
const { berechneTagesStatus } = require('../src/utils/tagesstatus');

describe('berechneTagesStatus — Ampel-Regeln', () => {
  // Regel 1: kein Soll-Tag, keine Abwesenheit
  test('Regel 1: kein Soll + keine Abwesenheit → kein_punkt', () => {
    expect(berechneTagesStatus({ sollMin: 0, abwTyp: null, hatKommen: false, hatGehen: false, hatMittag: false }))
      .toEqual({ status: 'kein_punkt', fehlt: { kommen: false, gehen: false, mittag: false } });
  });

  // Regel 2: Abwesenheit
  test('Regel 2: Urlaub → blau', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: 'urlaub', hatKommen: false, hatGehen: false, hatMittag: false }))
      .toEqual({ status: 'blau', fehlt: { kommen: false, gehen: false, mittag: false } });
  });
  test('Regel 2: Krank → blau', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: 'krank', hatKommen: false, hatGehen: false, hatMittag: false }).status).toBe('blau');
  });
  test('Regel 2: Lehrgang → blau', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: 'lehrgang', hatKommen: false, hatGehen: false, hatMittag: false }).status).toBe('blau');
  });

  // Regel 3: Soll, aber nichts gestempelt
  test('Regel 3: Soll ohne jede Stempelung → rot, alles fehlt', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: null, hatKommen: false, hatGehen: false, hatMittag: false }))
      .toEqual({ status: 'rot', fehlt: { kommen: true, gehen: true, mittag: true } });
  });

  // Regel 4: Alles vorhanden
  test('Regel 4: alles gestempelt → gruen', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: null, hatKommen: true, hatGehen: true, hatMittag: true }))
      .toEqual({ status: 'gruen', fehlt: { kommen: false, gehen: false, mittag: false } });
  });

  // Regel 5: nur Kommen fehlt
  test('Regel 5: Kommen fehlt (mit Mittag) → orange', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: null, hatKommen: false, hatGehen: true, hatMittag: true }))
      .toEqual({ status: 'orange', fehlt: { kommen: true, gehen: false, mittag: false } });
  });
  test('Regel 5: Kommen + Mittag fehlen → orange, beide in fehlt', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: null, hatKommen: false, hatGehen: true, hatMittag: false }))
      .toEqual({ status: 'orange', fehlt: { kommen: true, gehen: false, mittag: true } });
  });

  // Regel 6: nur Gehen fehlt
  test('Regel 6: Gehen fehlt (mit Mittag) → orange', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: null, hatKommen: true, hatGehen: false, hatMittag: true }))
      .toEqual({ status: 'orange', fehlt: { kommen: false, gehen: true, mittag: false } });
  });
  test('Regel 6: Gehen + Mittag fehlen → orange, beide in fehlt', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: null, hatKommen: true, hatGehen: false, hatMittag: false }))
      .toEqual({ status: 'orange', fehlt: { kommen: false, gehen: true, mittag: true } });
  });

  // Regel 7: nur Mittag fehlt
  test('Regel 7: nur Mittag fehlt → gelb', () => {
    expect(berechneTagesStatus({ sollMin: 480, abwTyp: null, hatKommen: true, hatGehen: true, hatMittag: false }))
      .toEqual({ status: 'gelb', fehlt: { kommen: false, gehen: false, mittag: true } });
  });

  // Edge Case: sollMin = 0 aber gestempelt (jemand hat freiwillig gearbeitet)
  test('Edge: kein Soll aber gestempelt → kein_punkt (nicht bewertet)', () => {
    expect(berechneTagesStatus({ sollMin: 0, abwTyp: null, hatKommen: true, hatGehen: true, hatMittag: true }).status).toBe('kein_punkt');
  });
});
```

- [ ] **Step 2: Test laufen lassen (FAIL: Modul nicht gefunden)**

Run: `cd backend && npm test -- nachstempel`
Expected: `Cannot find module '../src/utils/tagesstatus'`.

- [ ] **Step 3: Modul schreiben**

Erstelle `backend/src/utils/tagesstatus.js`:

```js
/**
 * Status-Berechnung für Zeitkonto-Ampel (siehe Spec 2026-04-24, Section 3).
 * Reine Funktion — keine DB-Zugriffe, keine Seiteneffekte.
 */

/**
 * @param {object} input
 * @param {number} input.sollMin - Soll-Minuten laut Dienstplan (0 = kein Arbeitstag)
 * @param {string|null} input.abwTyp - 'urlaub' | 'krank' | 'lehrgang' | andere | null
 * @param {boolean} input.hatKommen - Ist kommen_zeit gesetzt?
 * @param {boolean} input.hatGehen - Ist gehen_zeit gesetzt?
 * @param {boolean} input.hatMittag - Gibt es abgeschlossenen pause_tracking-Eintrag?
 * @returns {{status: string, fehlt: {kommen: boolean, gehen: boolean, mittag: boolean}}}
 */
function berechneTagesStatus({ sollMin, abwTyp, hatKommen, hatGehen, hatMittag }) {
  const istAbwesenheit = abwTyp === 'urlaub' || abwTyp === 'krank' || abwTyp === 'lehrgang';

  // Regel 2: Abwesenheit gewinnt immer
  if (istAbwesenheit) {
    return { status: 'blau', fehlt: { kommen: false, gehen: false, mittag: false } };
  }

  // Regel 1: kein Soll-Tag UND keine Abwesenheit
  if (sollMin <= 0) {
    return { status: 'kein_punkt', fehlt: { kommen: false, gehen: false, mittag: false } };
  }

  // Ab hier: Soll-Tag ohne Abwesenheit

  // Regel 3: nichts gestempelt
  if (!hatKommen && !hatGehen && !hatMittag) {
    return { status: 'rot', fehlt: { kommen: true, gehen: true, mittag: true } };
  }

  // Regel 4: alles da
  if (hatKommen && hatGehen && hatMittag) {
    return { status: 'gruen', fehlt: { kommen: false, gehen: false, mittag: false } };
  }

  // Regel 5: Kommen fehlt (Gehen vorhanden)
  if (!hatKommen && hatGehen) {
    return { status: 'orange', fehlt: { kommen: true, gehen: false, mittag: !hatMittag } };
  }

  // Regel 6: Gehen fehlt (Kommen vorhanden)
  if (hatKommen && !hatGehen) {
    return { status: 'orange', fehlt: { kommen: false, gehen: true, mittag: !hatMittag } };
  }

  // Regel 7: Kommen + Gehen vorhanden, nur Mittag fehlt
  return { status: 'gelb', fehlt: { kommen: false, gehen: false, mittag: true } };
}

module.exports = { berechneTagesStatus };
```

- [ ] **Step 4: Tests grün**

Run: `cd backend && npm test -- nachstempel`
Expected: 11 neue Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/tagesstatus.js backend/tests/nachstempel.test.js
git commit -m "feat(backend): berechneTagesStatus reine Funktion mit Ampel-Regeln"
```

---

## Task 3: Zeitkonto-Controller um Status-Felder erweitern

**Files:**
- Modify: `backend/src/controllers/zeitkontoController.js` (nur die `tage`-Erzeugung)
- Test: `backend/tests/nachstempel.test.js` (erweitern)

- [ ] **Step 1: Integrationstest für /api/zeitkonto schreiben**

Ans Ende von `backend/tests/nachstempel.test.js` anhängen. Erzeuge dafür ein Express-App-Fragment mit nur der zeitkonto-Route:

```js
const express = require('express');
const request = require('supertest');
const path = require('path');

describe('GET /api/zeitkonto — Status-Felder', () => {
  let db, app;

  beforeEach(async () => {
    db = await createTestDb();
    await ensureTagesstempelTable(db);
    await dbRun(db, `ALTER TABLE tagesstempel ADD COLUMN nachgefragt_am TEXT DEFAULT NULL`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS arbeitsunterbrechungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER, lehrling_id INTEGER, datum TEXT NOT NULL,
      start_zeit TEXT NOT NULL, ende_zeit TEXT,
      erstellt_am TEXT DEFAULT (datetime('now'))
    )`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS arbeitspausen (
      id INTEGER PRIMARY KEY AUTOINCREMENT, termin_id INTEGER,
      mitarbeiter_id INTEGER, lehrling_id INTEGER,
      gestartet_am DATETIME, beendet_am DATETIME, grund TEXT
    )`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS arbeitszeiten_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER, lehrling_id INTEGER,
      wochentag INTEGER, arbeitsstunden REAL DEFAULT 8,
      ist_frei INTEGER DEFAULT 0,
      arbeitszeit_start TEXT, arbeitszeit_ende TEXT,
      aktualisiert_am TEXT
    )`);
    await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv) VALUES (1, 'Max', 1)`);
    // Dienstplan: Mo–Fr 8h, Start 07:00, Ende 16:00 (mit 30min Pause)
    for (let wt = 1; wt <= 5; wt++) {
      await dbRun(db, `INSERT INTO arbeitszeiten_plan (mitarbeiter_id, wochentag, arbeitsstunden, arbeitszeit_start, arbeitszeit_ende)
                       VALUES (1, ?, 8, '07:00', '16:00')`, [wt]);
    }

    // Setze globalen db-Helper
    const dbHelper = require('../src/utils/dbHelper');
    dbHelper.setDb(db); // Muss existieren, siehe unten

    // Minimale Express-App mit zeitkonto-Route
    app = express();
    app.use(express.json());
    const ZeitkontoController = require('../src/controllers/zeitkontoController');
    app.get('/api/zeitkonto', ZeitkontoController.get);
  });
  afterEach(async () => { await closeTestDb(db); });

  // Do 23.04.2026 war ein Donnerstag → Soll-Tag
  test('grüner Tag: alles gestempelt → status gruen', async () => {
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am)
                     VALUES (1, '2026-04-23', '07:00', '16:00', 'stempel', 'stempel', NULL)`);
    await dbRun(db, `INSERT INTO pause_tracking (mitarbeiter_id, datum, pause_start_zeit, pause_ende_zeit, abgeschlossen)
                     VALUES (1, '2026-04-23', '12:00', '12:30', 1)`);

    const res = await request(app).get('/api/zeitkonto?von=2026-04-23&bis=2026-04-23');
    expect(res.status).toBe(200);
    const tag = res.body[0].tage.find(t => t.datum === '2026-04-23');
    expect(tag.status).toBe('gruen');
    expect(tag.fehlt).toEqual({ kommen: false, gehen: false, mittag: false });
  });

  test('gelber Tag: Mittag fehlt → status gelb', async () => {
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am)
                     VALUES (1, '2026-04-23', '07:00', '16:00', 'stempel', 'stempel', NULL)`);
    const res = await request(app).get('/api/zeitkonto?von=2026-04-23&bis=2026-04-23');
    const tag = res.body[0].tage.find(t => t.datum === '2026-04-23');
    expect(tag.status).toBe('gelb');
    expect(tag.fehlt.mittag).toBe(true);
  });

  test('oranger Tag: Gehen fehlt → status orange', async () => {
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, kommen_quelle, nachgefragt_am)
                     VALUES (1, '2026-04-23', '07:00', 'stempel', NULL)`);
    const res = await request(app).get('/api/zeitkonto?von=2026-04-23&bis=2026-04-23');
    const tag = res.body[0].tage.find(t => t.datum === '2026-04-23');
    expect(tag.status).toBe('orange');
    expect(tag.fehlt.gehen).toBe(true);
  });

  test('blauer Tag: Urlaub → status blau', async () => {
    await dbRun(db, `INSERT INTO abwesenheiten (mitarbeiter_id, typ, datum_von, datum_bis) VALUES (1, 'urlaub', '2026-04-23', '2026-04-23')`);
    const res = await request(app).get('/api/zeitkonto?von=2026-04-23&bis=2026-04-23');
    const tag = res.body[0].tage.find(t => t.datum === '2026-04-23');
    expect(tag.status).toBe('blau');
  });
});
```

- [ ] **Step 2: Test laufen lassen (FAIL erwartet — `dbHelper.setDb` existiert nicht)**

Run: `cd backend && npm test -- nachstempel`
Expected: Tests schlagen fehl.

- [ ] **Step 3: dbHelper für Tests erweitern (falls noch nicht möglich Test-DB zu injizieren)**

Öffne `backend/src/utils/dbHelper.js` und prüfe:
- Gibt es bereits einen `setDb()`-Export? Wenn ja, nichts tun.
- Wenn nein: Die bestehende Pattern erlauben in Tests normalerweise DB-Injection via env-var. Schaue `backend/tests/stempelzeiten.test.js` an wie bestehende Tests den Controller testen und übernimm dasselbe Pattern (copy the setup approach).

Falls kein sauberer Hook existiert: `abwRows`-Check anpassen, dass der Test via `beforeEach`-setup direkt gegen `process.env.DATA_DIR` oder einen mock-bare getter läuft.

**Hinweis für Engineer:** Wenn du hier in eine Sackgasse gerätst, schau dir bestehende Controller-Tests (`stempelzeiten.test.js`, `arbeitspausen.test.js`) an — die haben das Problem schon gelöst. Kopiere exakt das Muster.

- [ ] **Step 4: `zeitkontoController.js` erweitern**

Öffne `backend/src/controllers/zeitkontoController.js`.

Am Anfang der Datei nach den bestehenden `require`s hinzufügen:
```js
const { berechneTagesStatus } = require('../utils/tagesstatus');
```

In der Funktion `get` (ab Zeile 44) vor dem `Promise.all(personen.map(...))` einen Helper laden:

Nach Zeile 137 (`const abwRows = ...`) hinzufügen:
```js
// Map für Mittag-Check: { 'm_5_2026-04-23': true, ... }
const hatMittagMap = {};
pauseRows
  .filter(p => p.abgeschlossen === 1 && p.pause_start_zeit && p.pause_ende_zeit)
  .forEach(p => {
    const key = (p.mitarbeiter_id ? `m_${p.mitarbeiter_id}` : `l_${p.lehrling_id}`) + '_' + p.datum;
    hatMittagMap[key] = true;
  });
```

Ändere die `pauseRows`-Abfrage (Zeile 118-122), dass sie auch `abgeschlossen` selektiert (falls nicht schon):
```js
const pauseRows = await allAsync(
  `SELECT mitarbeiter_id, lehrling_id, datum, pause_start_zeit, pause_ende_zeit, abgeschlossen
   FROM pause_tracking
   WHERE datum >= ? AND datum <= ? AND abgeschlossen = 1 AND pause_ende_zeit IS NOT NULL`,
  [von, bis]
);
```

Lade auch `nachgefragt_am`. Die bestehende `stempelRows`-Query (Zeile 68-73) muss erweitert werden:
```js
const stempelRows = await allAsync(
  `SELECT ts.mitarbeiter_id, ts.lehrling_id, ts.datum, ts.kommen_zeit, ts.gehen_zeit, ts.nachgefragt_am
   FROM tagesstempel ts
   WHERE ts.datum >= ? AND ts.datum <= ?`,
  [von, bis]
);
```

In der `return {`-Struktur der `tageDetails.map` (Zeile 222-235) folgende Felder **zusätzlich** einfügen:
```js
// Direkt vor der schließenden Klammer
const statusInfo = berechneTagesStatus({
  sollMin,
  abwTyp,
  hatKommen: !!(stempel && stempel.kommen_zeit),
  hatGehen:  !!(stempel && stempel.gehen_zeit),
  hatMittag: !!hatMittagMap[stempelKey]
});

return {
  datum,
  // ... bestehende Felder bleiben unverändert ...
  unterbrechungen,
  ub_gesamt_min: ubGesamtMin,
  status: statusInfo.status,
  fehlt: statusInfo.fehlt,
  nachgefragt_am: stempel ? stempel.nachgefragt_am : null
};
```

Der `.filter`-Aufruf in Zeile 239 (`relevanteTage`) muss bleiben wie er ist — er zeigt nur Tage mit `soll_min > 0 || ist_min > 0 || abwesenheit`. Das stimmt weiter für unseren Fall.

- [ ] **Step 5: Tests laufen lassen**

Run: `cd backend && npm test -- nachstempel`
Expected: 4 neue Tests grün (grün/gelb/orange/blau).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/zeitkontoController.js backend/tests/nachstempel.test.js
git commit -m "feat(backend): /api/zeitkonto liefert status + fehlt + nachgefragt_am"
```

---

## Task 4: Endpoint `GET /api/tagesstempel/nachstempel-check`

**Files:**
- Modify: `backend/src/controllers/tagesstempelController.js` (neue Static-Methode `nachstempelCheck`)
- Test: `backend/tests/nachstempel.test.js`

- [ ] **Step 1: Tests schreiben**

Ans Ende von `backend/tests/nachstempel.test.js`:

```js
describe('GET /api/tagesstempel/nachstempel-check', () => {
  let db, app;
  beforeEach(async () => {
    db = await createTestDb();
    await ensureTagesstempelTable(db);
    await dbRun(db, `ALTER TABLE tagesstempel ADD COLUMN nachgefragt_am TEXT DEFAULT NULL`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS arbeitszeiten_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER, lehrling_id INTEGER, wochentag INTEGER,
      arbeitsstunden REAL, ist_frei INTEGER DEFAULT 0,
      arbeitszeit_start TEXT, arbeitszeit_ende TEXT, aktualisiert_am TEXT
    )`);
    await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv, mittagspause_start) VALUES (1, 'Max', 1, '12:00')`);
    for (let wt = 1; wt <= 5; wt++) {
      await dbRun(db, `INSERT INTO arbeitszeiten_plan (mitarbeiter_id, wochentag, arbeitsstunden, arbeitszeit_start, arbeitszeit_ende)
                       VALUES (1, ?, 8, '07:00', '16:00')`, [wt]);
    }
    app = express();
    app.use(express.json());
    const TagesstempelController = require('../src/controllers/tagesstempelController');
    app.get('/api/tagesstempel/nachstempel-check', TagesstempelController.nachstempelCheck);
  });
  afterEach(async () => { await closeTestDb(db); });

  test('grüner letzter Soll-Tag → nachstempel_noetig false', async () => {
    // Annahme: heute ist 2026-04-24 (Fr), letzter Soll-Tag ist 2026-04-23 (Do)
    jest.useFakeTimers().setSystemTime(new Date('2026-04-24T08:00:00'));
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle)
                     VALUES (1, '2026-04-23', '07:00', '16:00', 'stempel', 'stempel')`);
    await dbRun(db, `INSERT INTO pause_tracking (mitarbeiter_id, datum, pause_start_zeit, pause_ende_zeit, abgeschlossen)
                     VALUES (1, '2026-04-23', '12:00', '12:30', 1)`);

    const res = await request(app).get('/api/tagesstempel/nachstempel-check?mitarbeiter_id=1');
    expect(res.body.nachstempel_noetig).toBe(false);
    jest.useRealTimers();
  });

  test('gelber letzter Soll-Tag → nachstempel_noetig true + Defaults', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-24T08:00:00'));
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle)
                     VALUES (1, '2026-04-23', '07:00', '16:00', 'stempel', 'stempel')`);

    const res = await request(app).get('/api/tagesstempel/nachstempel-check?mitarbeiter_id=1');
    expect(res.body.nachstempel_noetig).toBe(true);
    expect(res.body.status).toBe('gelb');
    expect(res.body.fehlt.mittag).toBe(true);
    expect(res.body.defaults.mittagspause_start).toBe('12:00');
    expect(res.body.defaults.mittagspause_minuten).toBe(30);
    expect(res.body.defaults.kommen_zeit).toBe('07:00');
    expect(res.body.defaults.gehen_zeit).toBe('16:00');
    jest.useRealTimers();
  });

  test('nachgefragt_am gesetzt → nachstempel_noetig false (Re-Nag-Schutz)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-24T08:00:00'));
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am)
                     VALUES (1, '2026-04-23', '07:00', '16:00', 'stempel', 'stempel', '2026-04-24 07:00:00')`);

    const res = await request(app).get('/api/tagesstempel/nachstempel-check?mitarbeiter_id=1');
    expect(res.body.nachstempel_noetig).toBe(false);
    jest.useRealTimers();
  });

  test('Montag → findet Freitag als letzten Soll-Tag (Wochenende übersprungen)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-27T08:00:00')); // Mo
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle)
                     VALUES (1, '2026-04-24', '07:00', '16:00', 'stempel', 'stempel')`); // Fr ohne Mittag
    const res = await request(app).get('/api/tagesstempel/nachstempel-check?mitarbeiter_id=1');
    expect(res.body.datum).toBe('2026-04-24');
    jest.useRealTimers();
  });

  test('letzter Soll-Tag > 30 Tage zurück → nachstempel_noetig false', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T08:00:00'));
    // nichts eingetragen → letzter Soll-Tag nicht findbar → false
    const res = await request(app).get('/api/tagesstempel/nachstempel-check?mitarbeiter_id=1');
    expect(res.body.nachstempel_noetig).toBe(false);
    jest.useRealTimers();
  });

  test('ohne mitarbeiter_id oder lehrling_id → 400', async () => {
    const res = await request(app).get('/api/tagesstempel/nachstempel-check');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Tests FAIL: `nachstempelCheck` existiert nicht**

Run: `cd backend && npm test -- nachstempel`

- [ ] **Step 3: Handler `nachstempelCheck` in TagesstempelController implementieren**

Öffne `backend/src/controllers/tagesstempelController.js`.

Oben bei den Requires ergänzen:
```js
const ArbeitszeitenPlanModel = require('../models/arbeitszeitenPlanModel');
const { berechneTagesStatus } = require('../utils/tagesstatus');
```

Neue statische Methode **vor** der schließenden Klammer der `TagesstempelController`-Klasse einfügen (vor Zeile 649 — dem `module.exports`):

```js
  /**
   * GET /api/tagesstempel/nachstempel-check?mitarbeiter_id=X|lehrling_id=Y
   * Liefert Info ob der letzte Soll-Tag eine Nachstempelung braucht.
   */
  static async nachstempelCheck(req, res) {
    try {
      const mid = req.query.mitarbeiter_id ? Number(req.query.mitarbeiter_id) : null;
      const lid = req.query.lehrling_id ? Number(req.query.lehrling_id) : null;
      if (!mid && !lid) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      // Person holen
      const person = mid
        ? await getAsync(`SELECT id, name, mittagspause_start FROM mitarbeiter WHERE id = ? AND aktiv = 1`, [mid])
        : await getAsync(`SELECT id, name, mittagspause_start FROM lehrlinge WHERE id = ? AND aktiv = 1`, [lid]);
      if (!person) return res.status(404).json({ error: 'Person nicht gefunden' });

      // Heute + letzter Soll-Tag finden (max. 30 Tage zurück)
      const heute = new Date();
      heute.setHours(0, 0, 0, 0);
      const heuteStr = heute.toISOString().slice(0, 10);

      let letzterSollTag = null;
      let letzterPlan = null;
      for (let i = 1; i <= 30; i++) {
        const d = new Date(heute);
        d.setDate(d.getDate() - i);
        const datStr = d.toISOString().slice(0, 10);
        const plan = await ArbeitszeitenPlanModel.getForDate(mid, lid, datStr);
        if (!plan || plan.ist_frei || !plan.arbeitsstunden || plan.arbeitsstunden <= 0) continue;
        // Abwesenheit prüfen
        const abw = await getAsync(
          `SELECT typ FROM abwesenheiten
            WHERE ${mid ? 'mitarbeiter_id = ?' : 'lehrling_id = ?'}
              AND datum_von <= ? AND datum_bis >= ?
              AND typ IN ('urlaub','krank','lehrgang')`,
          [mid || lid, datStr, datStr]
        );
        if (abw) continue; // Abwesenheit = nicht fragen

        letzterSollTag = datStr;
        letzterPlan = plan;
        break;
      }

      if (!letzterSollTag) {
        return res.json({ nachstempel_noetig: false });
      }

      // Stempel + nachgefragt_am laden
      const stempel = mid
        ? await getAsync(`SELECT kommen_zeit, gehen_zeit, nachgefragt_am FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`, [mid, letzterSollTag])
        : await getAsync(`SELECT kommen_zeit, gehen_zeit, nachgefragt_am FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`, [lid, letzterSollTag]);

      if (stempel && stempel.nachgefragt_am) {
        return res.json({ nachstempel_noetig: false });
      }

      // Mittag-Check
      const pause = mid
        ? await getAsync(`SELECT id FROM pause_tracking WHERE mitarbeiter_id = ? AND datum = ? AND abgeschlossen = 1 AND pause_ende_zeit IS NOT NULL`, [mid, letzterSollTag])
        : await getAsync(`SELECT id FROM pause_tracking WHERE lehrling_id = ? AND datum = ? AND abgeschlossen = 1 AND pause_ende_zeit IS NOT NULL`, [lid, letzterSollTag]);

      const statusInfo = berechneTagesStatus({
        sollMin: Math.round((letzterPlan.arbeitsstunden || 0) * 60),
        abwTyp: null,
        hatKommen: !!(stempel && stempel.kommen_zeit),
        hatGehen:  !!(stempel && stempel.gehen_zeit),
        hatMittag: !!pause
      });

      if (statusInfo.status === 'gruen' || statusInfo.status === 'kein_punkt' || statusInfo.status === 'blau') {
        return res.json({ nachstempel_noetig: false });
      }

      // Defaults aus Plan + Einstellungen
      const einstellungen = await getAsync(`SELECT mittagspause_minuten FROM werkstatt_einstellungen WHERE id = 1`);
      const mittagspauseMinuten = (einstellungen && einstellungen.mittagspause_minuten) || 30;

      return res.json({
        nachstempel_noetig: true,
        datum: letzterSollTag,
        status: statusInfo.status,
        fehlt: statusInfo.fehlt,
        defaults: {
          kommen_zeit: letzterPlan.arbeitszeit_start || '07:00',
          gehen_zeit:  letzterPlan.arbeitszeit_ende  || '16:00',
          mittagspause_start: person.mittagspause_start || '12:00',
          mittagspause_minuten: mittagspauseMinuten
        },
        person: { typ: mid ? 'mitarbeiter' : 'lehrling', id: person.id, name: person.name }
      });
    } catch (err) {
      console.error('[Nachstempel-Check] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }
```

- [ ] **Step 4: Tests grün**

Run: `cd backend && npm test -- nachstempel`
Expected: 6 neue Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/tagesstempelController.js backend/tests/nachstempel.test.js
git commit -m "feat(backend): GET /api/tagesstempel/nachstempel-check"
```

---

## Task 5: Endpoint `POST /api/tagesstempel/nachstempel`

**Files:**
- Modify: `backend/src/controllers/tagesstempelController.js` (Handler `nachstempel`)
- Test: `backend/tests/nachstempel.test.js`

- [ ] **Step 1: Tests für POST /nachstempel schreiben**

```js
describe('POST /api/tagesstempel/nachstempel', () => {
  let db, app;
  beforeEach(async () => {
    db = await createTestDb();
    await ensureTagesstempelTable(db);
    await dbRun(db, `ALTER TABLE tagesstempel ADD COLUMN nachgefragt_am TEXT DEFAULT NULL`);
    await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv, mittagspause_start) VALUES (1, 'Max', 1, '12:00')`);
    app = express();
    app.use(express.json());
    const TagesstempelController = require('../src/controllers/tagesstempelController');
    app.post('/api/tagesstempel/nachstempel', TagesstempelController.nachstempel);
  });
  afterEach(async () => { await closeTestDb(db); });

  test('vollständig: legt tagesstempel + pause_tracking an, setzt nachgefragt_am', async () => {
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, kommen_quelle)
                     VALUES (1, '2026-04-23', '07:00', 'stempel')`);
    const res = await request(app)
      .post('/api/tagesstempel/nachstempel')
      .send({
        mitarbeiter_id: 1, datum: '2026-04-23', antwort: 'anwesend',
        kommen_zeit: null, gehen_zeit: '16:00', mittag_gemacht: true
      });
    expect(res.body.success).toBe(true);
    const ts = await dbGet(db, `SELECT * FROM tagesstempel WHERE mitarbeiter_id = 1 AND datum = '2026-04-23'`);
    expect(ts.gehen_zeit).toBe('16:00');
    expect(ts.gehen_quelle).toBe('manuell');
    expect(ts.nachgefragt_am).not.toBeNull();
    const pause = await dbGet(db, `SELECT * FROM pause_tracking WHERE mitarbeiter_id = 1 AND datum = '2026-04-23'`);
    expect(pause.pause_start_zeit).toBe('12:00');
    expect(pause.pause_ende_zeit).toBe('12:30');
    expect(pause.abgeschlossen).toBe(1);
  });

  test('mittag_gemacht:false → kein pause_tracking-Eintrag', async () => {
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle)
                     VALUES (1, '2026-04-23', '07:00', '16:00', 'stempel', 'stempel')`);
    await request(app).post('/api/tagesstempel/nachstempel').send({
      mitarbeiter_id: 1, datum: '2026-04-23', antwort: 'anwesend',
      kommen_zeit: null, gehen_zeit: null, mittag_gemacht: false
    });
    const pause = await dbGet(db, `SELECT * FROM pause_tracking WHERE mitarbeiter_id = 1`);
    expect(pause).toBeUndefined();
  });

  test('roter Tag nicht_anwesend → Platzhalter ohne Zeiten', async () => {
    const res = await request(app).post('/api/tagesstempel/nachstempel').send({
      mitarbeiter_id: 1, datum: '2026-04-23', antwort: 'nicht_anwesend',
      kommen_zeit: null, gehen_zeit: null, mittag_gemacht: null
    });
    expect(res.body.success).toBe(true);
    const ts = await dbGet(db, `SELECT * FROM tagesstempel WHERE mitarbeiter_id = 1 AND datum = '2026-04-23'`);
    expect(ts.kommen_zeit).toBeNull();
    expect(ts.gehen_zeit).toBeNull();
    expect(ts.nachgefragt_am).not.toBeNull();
  });

  test('Pause-Start-Kappung: Mitarbeiter geht 11:30 → Pause endet ≤ 11:30', async () => {
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle)
                     VALUES (1, '2026-04-23', '07:00', '11:30', 'stempel', 'manuell')`);
    await request(app).post('/api/tagesstempel/nachstempel').send({
      mitarbeiter_id: 1, datum: '2026-04-23', antwort: 'anwesend',
      kommen_zeit: null, gehen_zeit: null, mittag_gemacht: true
    });
    const pause = await dbGet(db, `SELECT * FROM pause_tracking WHERE mitarbeiter_id = 1`);
    // gehen_zeit = 11:30, minuten = 30 → max. pause_start = 11:00, pause_ende = 11:30
    expect(pause.pause_start_zeit).toBe('11:00');
    expect(pause.pause_ende_zeit).toBe('11:30');
  });

  test('ungültiges Zeitformat → 400', async () => {
    const res = await request(app).post('/api/tagesstempel/nachstempel').send({
      mitarbeiter_id: 1, datum: '2026-04-23', antwort: 'anwesend',
      kommen_zeit: '25:99', gehen_zeit: null, mittag_gemacht: false
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Tests FAIL: `nachstempel` existiert nicht**

- [ ] **Step 3: Handler implementieren**

In `backend/src/controllers/tagesstempelController.js` nach `nachstempelCheck` einfügen:

```js
  /**
   * POST /api/tagesstempel/nachstempel
   * Body: { mitarbeiter_id|lehrling_id, datum, antwort, kommen_zeit, gehen_zeit, mittag_gemacht }
   */
  static async nachstempel(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, datum, antwort, kommen_zeit, gehen_zeit, mittag_gemacht } = req.body;
      if (!mitarbeiter_id && !lehrling_id) return res.status(400).json({ error: 'Person-ID erforderlich' });
      if (!datum) return res.status(400).json({ error: 'datum erforderlich' });
      const ZEIT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (kommen_zeit && !ZEIT_RE.test(kommen_zeit)) return res.status(400).json({ error: 'Ungültige kommen_zeit' });
      if (gehen_zeit  && !ZEIT_RE.test(gehen_zeit))  return res.status(400).json({ error: 'Ungültige gehen_zeit' });

      // 1. tagesstempel finden oder anlegen
      const existing = mitarbeiter_id
        ? await getAsync(`SELECT id, kommen_zeit, gehen_zeit FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`, [mitarbeiter_id, datum])
        : await getAsync(`SELECT id, kommen_zeit, gehen_zeit FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`, [lehrling_id, datum]);

      if (existing) {
        const sets = [];
        const params = [];
        if (kommen_zeit !== null && kommen_zeit !== undefined) {
          sets.push('kommen_zeit = ?', "kommen_quelle = 'manuell'");
          params.push(kommen_zeit);
        }
        if (gehen_zeit !== null && gehen_zeit !== undefined) {
          sets.push('gehen_zeit = ?', "gehen_quelle = 'manuell'");
          params.push(gehen_zeit);
        }
        sets.push('nachgefragt_am = datetime(\'now\')');
        if (sets.length > 0) {
          params.push(existing.id);
          await runAsync(`UPDATE tagesstempel SET ${sets.join(', ')} WHERE id = ?`, params);
        }
      } else {
        // Neuen Eintrag anlegen
        if (mitarbeiter_id) {
          await runAsync(
            `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am, erstellt_am)
             VALUES (?, ?, ?, ?, CASE WHEN ? IS NOT NULL THEN 'manuell' END, CASE WHEN ? IS NOT NULL THEN 'manuell' END, datetime('now'), datetime('now'))`,
            [mitarbeiter_id, datum, kommen_zeit || null, gehen_zeit || null, kommen_zeit || null, gehen_zeit || null]
          );
        } else {
          await runAsync(
            `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am, erstellt_am)
             VALUES (?, ?, ?, ?, CASE WHEN ? IS NOT NULL THEN 'manuell' END, CASE WHEN ? IS NOT NULL THEN 'manuell' END, datetime('now'), datetime('now'))`,
            [lehrling_id, datum, kommen_zeit || null, gehen_zeit || null, kommen_zeit || null, gehen_zeit || null]
          );
        }
      }

      // 2. Mittag eintragen falls mittag_gemacht:true
      if (mittag_gemacht === true) {
        // Mittagspausen-Zeiten berechnen
        const person = mitarbeiter_id
          ? await getAsync(`SELECT mittagspause_start FROM mitarbeiter WHERE id = ?`, [mitarbeiter_id])
          : await getAsync(`SELECT mittagspause_start FROM lehrlinge WHERE id = ?`, [lehrling_id]);
        const einst = await getAsync(`SELECT mittagspause_minuten FROM werkstatt_einstellungen WHERE id = 1`);
        const minuten = (einst && einst.mittagspause_minuten) || 30;
        const planStart = (person && person.mittagspause_start) || '12:00';

        // Kappung: pause muss vor gehen_zeit enden
        const aktuelleGehenZeit = gehen_zeit || (existing && existing.gehen_zeit);
        const zuMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
        const ausMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

        let pauseStartMin = zuMin(planStart);
        if (aktuelleGehenZeit) {
          const maxStart = zuMin(aktuelleGehenZeit) - minuten;
          if (maxStart < pauseStartMin) pauseStartMin = maxStart;
        }
        const pauseStart = ausMin(Math.max(0, pauseStartMin));
        const pauseEnde = ausMin(Math.max(0, pauseStartMin + minuten));

        await runAsync(
          `INSERT INTO pause_tracking (mitarbeiter_id, lehrling_id, datum, pause_start_zeit, pause_ende_zeit, abgeschlossen, erstellt_am)
           VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`,
          [mitarbeiter_id || null, lehrling_id || null, datum, pauseStart, pauseEnde]
        );
      }

      broadcastEvent('tagesstempel.nachgestempelt', {
        mitarbeiter_id: mitarbeiter_id || null,
        lehrling_id: lehrling_id || null,
        datum,
        antwort
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[Nachstempel] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }
```

- [ ] **Step 4: Tests grün**

Run: `cd backend && npm test -- nachstempel`
Expected: 5 neue Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/tagesstempelController.js backend/tests/nachstempel.test.js
git commit -m "feat(backend): POST /api/tagesstempel/nachstempel"
```

---

## Task 6: Endpoint `POST /api/tagesstempel/nachstempel/dismiss`

**Files:**
- Modify: `backend/src/controllers/tagesstempelController.js`
- Test: `backend/tests/nachstempel.test.js`

- [ ] **Step 1: Test schreiben**

```js
describe('POST /api/tagesstempel/nachstempel/dismiss', () => {
  let db, app;
  beforeEach(async () => {
    db = await createTestDb();
    await ensureTagesstempelTable(db);
    await dbRun(db, `ALTER TABLE tagesstempel ADD COLUMN nachgefragt_am TEXT DEFAULT NULL`);
    await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv) VALUES (1, 'Max', 1)`);
    app = express();
    app.use(express.json());
    const TagesstempelController = require('../src/controllers/tagesstempelController');
    app.post('/api/tagesstempel/nachstempel/dismiss', TagesstempelController.nachstempelDismiss);
  });
  afterEach(async () => { await closeTestDb(db); });

  test('setzt nur nachgefragt_am wenn Eintrag existiert', async () => {
    await dbRun(db, `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, kommen_quelle)
                     VALUES (1, '2026-04-23', '07:00', 'stempel')`);
    await request(app).post('/api/tagesstempel/nachstempel/dismiss').send({ mitarbeiter_id: 1, datum: '2026-04-23' });
    const ts = await dbGet(db, `SELECT kommen_zeit, nachgefragt_am FROM tagesstempel WHERE mitarbeiter_id = 1`);
    expect(ts.kommen_zeit).toBe('07:00');
    expect(ts.nachgefragt_am).not.toBeNull();
  });

  test('erstellt Platzhalter wenn kein Eintrag existiert', async () => {
    await request(app).post('/api/tagesstempel/nachstempel/dismiss').send({ mitarbeiter_id: 1, datum: '2026-04-23' });
    const ts = await dbGet(db, `SELECT kommen_zeit, nachgefragt_am FROM tagesstempel WHERE mitarbeiter_id = 1`);
    expect(ts.kommen_zeit).toBeNull();
    expect(ts.nachgefragt_am).not.toBeNull();
  });
});
```

- [ ] **Step 2: Tests FAIL**

- [ ] **Step 3: Handler implementieren**

In `tagesstempelController.js` nach `nachstempel` einfügen:

```js
  /**
   * POST /api/tagesstempel/nachstempel/dismiss
   * Body: { mitarbeiter_id|lehrling_id, datum }
   */
  static async nachstempelDismiss(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, datum } = req.body;
      if (!mitarbeiter_id && !lehrling_id) return res.status(400).json({ error: 'Person-ID erforderlich' });
      if (!datum) return res.status(400).json({ error: 'datum erforderlich' });

      const existing = mitarbeiter_id
        ? await getAsync(`SELECT id FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`, [mitarbeiter_id, datum])
        : await getAsync(`SELECT id FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`, [lehrling_id, datum]);

      if (existing) {
        await runAsync(`UPDATE tagesstempel SET nachgefragt_am = datetime('now') WHERE id = ?`, [existing.id]);
      } else {
        if (mitarbeiter_id) {
          await runAsync(
            `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, nachgefragt_am, erstellt_am)
             VALUES (?, ?, NULL, NULL, datetime('now'), datetime('now'))`,
            [mitarbeiter_id, datum]
          );
        } else {
          await runAsync(
            `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, gehen_zeit, nachgefragt_am, erstellt_am)
             VALUES (?, ?, NULL, NULL, datetime('now'), datetime('now'))`,
            [lehrling_id, datum]
          );
        }
      }

      broadcastEvent('tagesstempel.nachgefragt', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true });
    } catch (err) {
      console.error('[Nachstempel-Dismiss] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }
```

- [ ] **Step 4: Tests grün**

Run: `cd backend && npm test -- nachstempel`

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/tagesstempelController.js backend/tests/nachstempel.test.js
git commit -m "feat(backend): POST /api/tagesstempel/nachstempel/dismiss"
```

---

## Task 7: Routen verdrahten

**Files:**
- Modify: `backend/src/routes/tagesstempelRoutes.js`

- [ ] **Step 1: Routen hinzufügen**

Öffne `backend/src/routes/tagesstempelRoutes.js`. Nach der Zeile `router.patch('/pause/:id', ...)` einfügen:

```js
router.get('/nachstempel-check', TagesstempelController.nachstempelCheck);
router.post('/nachstempel', TagesstempelController.nachstempel);
router.post('/nachstempel/dismiss', TagesstempelController.nachstempelDismiss);
```

- [ ] **Step 2: Alle Backend-Tests laufen lassen**

Run: `cd backend && npm test`
Expected: alle grün (keine Regression).

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/tagesstempelRoutes.js
git commit -m "feat(backend): Nachstempel-Routen verdrahten"
```

---

## Task 8: Frontend Zeitkonto — Statuspunkt + Legende

**Files:**
- Modify: `frontend/src/components/app.js` (`renderZeitkonto`)
- Modify: `frontend/index.html` (Legenden-Block)

- [ ] **Step 1: Farb-Legende im index.html hinzufügen**

In `frontend/index.html`, direkt **vor** `<div id="zeitkontoContainer">` (bei Zeile 3873), einen Legenden-Block einfügen:

```html
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#374151;display:flex;flex-wrap:wrap;gap:14px;align-items:center;">
    <span style="font-weight:600;">Legende:</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-right:4px;vertical-align:middle;"></span>Vollständig</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#eab308;margin-right:4px;vertical-align:middle;"></span>Mittag fehlt</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f97316;margin-right:4px;vertical-align:middle;"></span>Kommen/Gehen fehlt</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:4px;vertical-align:middle;"></span>Nicht gestempelt</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3b82f6;margin-right:4px;vertical-align:middle;"></span>Urlaub/Krank/Lehrgang</span>
</div>
```

- [ ] **Step 2: Tab-Integrität prüfen**

Run: `grep -c "data-tab=" frontend/index.html`
Expected: Zahl ist gleich wie vor der Änderung (du hast keinen Tab entfernt).

Zusätzlich in PowerShell:
```powershell
foreach ($tab in @("dashboard","heute","termine","kalender","kunden","zeitverwaltung","zeitstempelung","auslastung","intern","papierkorb","einstellungen")) {
  if (!(Select-String -Path "frontend/index.html" -Pattern "data-tab=`"$tab`"" -Quiet)) { Write-Host "FEHLT: $tab" -ForegroundColor Red }
}
```
Expected: keine Ausgabe ("FEHLT: …").

- [ ] **Step 3: `renderZeitkonto` in app.js erweitern**

In `frontend/src/components/app.js`, Funktion `renderZeitkonto` (ab Zeile 31164).

Nach der Zeile `const abwLabel = {...};` (~31181) folgende Konstanten einfügen:

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

In der `<thead><tr>`-Definition (Zeile 31273) eine neue Spalte ganz links einfügen:

```html
<th style="padding:4px 4px;text-align:center;width:22px;"></th>
<th style="padding:4px 8px;text-align:left;">Tag</th>
...
```

In der `tageHtml`-Erzeugung (Zeile 31240-31248) die `<tr>` entsprechend erweitern — als **erste** `<td>` der Zeile:

```js
const statusDotHtml = (t.status && t.status !== 'kein_punkt' && STATUS_FARBEN[t.status])
  ? `<span class="status-dot" data-datum="${t.datum}" data-idx="${idx}" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${STATUS_FARBEN[t.status]};cursor:${(t.status === 'gelb' || t.status === 'orange' || t.status === 'rot') ? 'pointer' : 'default'};" title="${STATUS_TOOLTIP[t.status]}"></span>`
  : '';

return `<tr style="font-size:12px;${nichtGestempelt ? 'opacity:0.6;' : ''}">
  <td style="padding:3px 4px;text-align:center;">${statusDotHtml}</td>
  <td style="padding:3px 8px;white-space:nowrap;color:#888;">${wt} ${dStr}</td>
  ...
</tr>`;
```

- [ ] **Step 4: Build und Smoke-Test**

```bash
cd frontend && npm run build
```
Expected: Build-Erfolg, neue Hash-Namen in `frontend/dist/assets/`.

Manuell in `cd backend && npm run dev` starten und browser öffnen `http://localhost:3001` → Tab Zeitverwaltung → Zeitkonto. Prüfen:
- Legende sichtbar über Liste
- Nach Personen-Klick: Tage haben Statuspunkt ganz links (wenn Daten vorhanden)
- Grüne Tage grün, gelbe gelb usw.

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html frontend/src/components/app.js
git commit -m "feat(frontend): Status-Ampel + Legende im Zeitkonto"
```

---

## Task 9: WebSocket-Handler für tagesstempel.nachgestempelt

**Files:**
- Modify: `frontend/src/components/app.js` (`handleWebSocketMessage`)

- [ ] **Step 1: Finde `handleWebSocketMessage` und Handler hinzufügen**

Suche in `frontend/src/components/app.js`: `handleWebSocketMessage`.

Finde den Abschnitt der `tagesstempel.*`-Events verarbeitet (Pattern-Match `'tagesstempel.'` oder `startsWith('tagesstempel')`).

Ergänze die Behandlung um zwei neue Event-Namen:

```js
if (type === 'tagesstempel.nachgestempelt' || type === 'tagesstempel.nachgefragt') {
  // Zeitkonto neu laden wenn aktiv
  if (document.getElementById('ztPanelZeitkonto')?.style.display !== 'none') {
    if (typeof this.loadZeitkonto === 'function') this.loadZeitkonto();
  }
  return;
}
```

Falls die bestehenden `tagesstempel.*`-Handler schon einen allgemeinen Fallback haben, reicht ggf. ein Zusatz in der Liste der bekannten Subtypes.

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Manueller Test**

Zwei Browser-Tabs öffnen, beide im Zeitkonto-Tab. In einem Tab per Backend-API-Call (z.B. `curl`) einen `/nachstempel` ausführen → zweiter Tab aktualisiert sich ohne Reload.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat(frontend): WebSocket-Handler für nachstempel-Events"
```

---

## Task 10: Inline-Bearbeitungs-Panel im Zeitkonto

**Files:**
- Modify: `frontend/src/components/app.js` (`renderZeitkonto` + Click-Handler)

- [ ] **Step 1: Click-Handler für `.status-dot` einbauen**

Nach dem bestehenden `container.querySelectorAll('.zeitkonto-row').forEach(...)` (ca. Zeile 31291) neuen Handler ergänzen:

```js
container.querySelectorAll('.status-dot').forEach(dot => {
  dot.addEventListener('click', (e) => {
    e.stopPropagation(); // Verhindert, dass die Personen-Zeile auf-/einklappt
    const datum = dot.dataset.datum;
    const idx = dot.dataset.idx;
    this.openNachstempelPanel(dot, daten[idx], datum);
  });
});
```

- [ ] **Step 2: Methode `openNachstempelPanel` hinzufügen**

An einer sinnvollen Stelle in der `app`-Klasse (z.B. direkt nach `renderZeitkonto`) die Methode einfügen:

```js
openNachstempelPanel(dotEl, person, datum) {
  // Schließe bereits offene Panels
  document.querySelectorAll('.nachstempel-panel').forEach(p => p.remove());

  const row = dotEl.closest('tr');
  if (!row) return;

  const tag = person.tage.find(t => t.datum === datum);
  if (!tag) return;

  const personId = person.id;
  const typ = person.typ; // 'mitarbeiter' | 'lehrling'

  // Defaults holen: Dienstplan-Zeiten (soll_start/soll_ende falls im Response)
  const kommenDefault = tag.soll_start || '07:00';
  const gehenDefault  = tag.soll_ende  || '16:00';

  const panel = document.createElement('tr');
  panel.className = 'nachstempel-panel';
  panel.innerHTML = `
    <td colspan="8" style="background:#fef9c3;padding:10px 14px;border-top:1px solid #fcd34d;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;font-size:12px;">
        <div><label style="display:block;color:#78350f;font-weight:600;">Kommen:</label>
          <input type="time" class="np-kommen" value="${tag.kommen_zeit ? tag.kommen_zeit.substring(0,5) : kommenDefault}" style="padding:4px 6px;">
        </div>
        <div><label style="display:block;color:#78350f;font-weight:600;">Gehen:</label>
          <input type="time" class="np-gehen" value="${tag.gehen_zeit ? tag.gehen_zeit.substring(0,5) : gehenDefault}" style="padding:4px 6px;">
        </div>
        <div><label style="display:block;color:#78350f;font-weight:600;">
          <input type="checkbox" class="np-mittag" ${tag.fehlt && tag.fehlt.mittag ? '' : 'checked'}> Mittag gemacht
        </label></div>
        <button class="np-speichern" style="padding:6px 14px;background:#22c55e;color:#fff;border:none;border-radius:4px;cursor:pointer;">Speichern</button>
        <button class="np-abbrechen" style="padding:6px 14px;background:#e5e7eb;border:none;border-radius:4px;cursor:pointer;">Abbrechen</button>
      </div>
    </td>
  `;
  row.parentNode.insertBefore(panel, row.nextSibling);

  panel.querySelector('.np-abbrechen').addEventListener('click', () => panel.remove());
  panel.querySelector('.np-speichern').addEventListener('click', async () => {
    const kommen = panel.querySelector('.np-kommen').value;
    const gehen  = panel.querySelector('.np-gehen').value;
    const mittag = panel.querySelector('.np-mittag').checked;
    try {
      const body = { datum, antwort: 'anwesend', mittag_gemacht: mittag, kommen_zeit: kommen || null, gehen_zeit: gehen || null };
      body[typ === 'mitarbeiter' ? 'mitarbeiter_id' : 'lehrling_id'] = personId;
      await ApiService.post('/tagesstempel/nachstempel', body);
      panel.remove();
      // Reload via WebSocket (kommt automatisch) ODER direkt neu laden:
      if (typeof this.loadZeitkonto === 'function') this.loadZeitkonto();
    } catch (e) {
      console.error('[Nachstempel] Fehler:', e);
      alert('Speichern fehlgeschlagen: ' + (e.message || 'unbekannt'));
    }
  });
}
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Manueller Test**

- Gelben Punkt klicken → Panel öffnet mit Kommen+Gehen prefilled, Checkbox "Mittag gemacht" unchecked (weil `fehlt.mittag=true`)
- Checkbox anhaken + Speichern → Panel schließt, Punkt wird grün
- Orangen Punkt klicken → Gehen-Feld leer, gefüllt mit Default aus Dienstplan
- Roten Punkt klicken → Beide Felder leer, Checkbox unchecked
- `e.stopPropagation()` prüfen: Klick auf Punkt klappt **nicht** die Personen-Zeile zu/auf

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat(frontend): Inline-Bearbeitungs-Panel im Zeitkonto"
```

---

## Task 11: Tablet-App — Dialog-Funktion und Styles

**Files:**
- Modify: `electron-intern-tablet/index.html`

Die Tablet-App ist eine standalone HTML-Datei mit eingebettetem CSS und JS. Wir fügen eine neue Dialog-Funktion und CSS-Klassen hinzu.

- [ ] **Step 1: CSS-Klassen im `<style>`-Block ergänzen**

In `electron-intern-tablet/index.html`, nach der Klasse `.tablet-btn-kommen` (ca. Zeile 764-774), neue Klassen ergänzen:

```css
.nachstempel-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.72);
    z-index: 10000; display: flex; align-items: center; justify-content: center;
}
.nachstempel-dialog {
    background: #fff; border-radius: 12px; padding: 28px 32px;
    min-width: 420px; max-width: 640px; box-shadow: 0 10px 40px rgba(0,0,0,0.4);
}
.nachstempel-dialog h2 {
    margin: 0 0 6px 0; font-size: 22px; color: #111827;
}
.nachstempel-dialog .sub {
    margin: 0 0 18px 0; color: #6b7280; font-size: 14px;
}
.nachstempel-dialog .frage {
    margin: 16px 0 10px; font-size: 16px; color: #1f2937; font-weight: 600;
}
.nachstempel-dialog .btn-row {
    display: flex; gap: 12px; margin-top: 6px; flex-wrap: wrap;
}
.nachstempel-dialog .btn-ja, .nachstempel-dialog .btn-nein,
.nachstempel-dialog .btn-save {
    flex: 1; min-width: 140px; padding: 14px 20px; border: none;
    border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;
}
.nachstempel-dialog .btn-ja, .nachstempel-dialog .btn-save { background: #22c55e; color: #fff; }
.nachstempel-dialog .btn-nein { background: #ef4444; color: #fff; }
.nachstempel-dialog .btn-abbrechen {
    background: none; border: none; color: #6b7280; padding: 8px 14px;
    cursor: pointer; text-decoration: underline; font-size: 14px;
}
.nachstempel-dialog .zeit-input {
    display: inline-block; padding: 10px 14px; font-size: 18px;
    border: 2px solid #d1d5db; border-radius: 6px; width: 100px; text-align: center;
}
.nachstempel-dialog .footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 20px; padding-top: 14px; border-top: 1px solid #e5e7eb;
}
```

- [ ] **Step 2: Commit (nur CSS)**

```bash
git add electron-intern-tablet/index.html
git commit -m "feat(tablet): CSS für Nachstempel-Dialog"
```

---

## Task 12: Tablet-Dialog — Funktion `showNachstempelDialog`

**Files:**
- Modify: `electron-intern-tablet/index.html`

- [ ] **Step 1: Dialog-Funktion in `<script>`-Block einfügen**

Unmittelbar **vor** der Funktion `async function tagesstempelKommen(...)` (ca. Zeile 3051), neue Funktion einfügen:

```js
function _formatDatumDE(isoDatum) {
  const [j, m, t] = isoDatum.split('-');
  const d = new Date(`${isoDatum}T00:00:00`);
  const wt = ['So.','Mo.','Di.','Mi.','Do.','Fr.','Sa.'][d.getDay()];
  return `${wt}, ${t}.${m}.${j}`;
}

async function showNachstempelDialog(check) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'nachstempel-overlay';
    const dlg = document.createElement('div');
    dlg.className = 'nachstempel-dialog';

    const datumFormatiert = _formatDatumDE(check.datum);
    const personName = check.person?.name || '';

    // Variante bestimmen
    const istRot = check.status === 'rot';
    const fehltKommen = !!check.fehlt.kommen;
    const fehltGehen  = !!check.fehlt.gehen;
    const fehltMittag = !!check.fehlt.mittag;

    // Rot: zuerst Ja/Nein-Frage
    if (istRot) {
      dlg.innerHTML = `
        <h2>Nachstempelung</h2>
        <p class="sub">${personName} — ${datumFormatiert}</p>
        <p class="frage">Gestern ist keine Zeit erfasst. Warst du da?</p>
        <div class="btn-row">
          <button class="btn-ja">Ja</button>
          <button class="btn-nein">Nein, freier Tag</button>
        </div>
        <div class="footer">
          <button class="btn-abbrechen">Später entscheiden</button>
        </div>
      `;
      overlay.appendChild(dlg);
      document.body.appendChild(overlay);

      dlg.querySelector('.btn-nein').onclick = async () => {
        await _nachstempelSave(check, 'nicht_anwesend', null, null, null);
        overlay.remove(); resolve();
      };
      dlg.querySelector('.btn-ja').onclick = () => {
        overlay.remove();
        _zeigeZeitDialog(check, true).then(resolve);
      };
      dlg.querySelector('.btn-abbrechen').onclick = async () => {
        await _nachstempelDismiss(check);
        overlay.remove(); resolve();
      };
      return;
    }

    // Nicht-Rot: Zeit-Dialog direkt (orange/gelb)
    _zeigeZeitDialog(check, false).then(resolve);
  });
}

async function _zeigeZeitDialog(check, istRotFall) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'nachstempel-overlay';
    const dlg = document.createElement('div');
    dlg.className = 'nachstempel-dialog';

    const datumFormatiert = _formatDatumDE(check.datum);
    const personName = check.person?.name || '';
    const fehltKommen = !!check.fehlt.kommen || istRotFall;
    const fehltGehen  = !!check.fehlt.gehen  || istRotFall;
    const fehltMittag = !!check.fehlt.mittag || istRotFall;

    const kommenDefault = check.defaults.kommen_zeit;
    const gehenDefault  = check.defaults.gehen_zeit;

    // Nur Mittag fehlt → Ein-Klick-Ja/Nein
    const nurMittag = !fehltKommen && !fehltGehen && fehltMittag;

    let html = `<h2>Nachstempelung für ${datumFormatiert}</h2><p class="sub">${personName}</p>`;

    if (fehltKommen) {
      html += `<p class="frage">🕘 Wann hast du angefangen?</p>
               <input type="time" class="np-kommen zeit-input" value="${kommenDefault}">`;
    }
    if (fehltGehen) {
      html += `<p class="frage">🕘 Wann bist du Feierabend gegangen?</p>
               <input type="time" class="np-gehen zeit-input" value="${gehenDefault}">`;
    }
    if (fehltMittag) {
      html += `<p class="frage">🍽 Hast du Mittag gemacht?</p>`;
      if (nurMittag) {
        html += `<div class="btn-row">
                   <button class="btn-ja np-mittag-ja">Ja</button>
                   <button class="btn-nein np-mittag-nein">Nein</button>
                 </div>`;
      } else {
        html += `<div class="btn-row">
                   <label><input type="radio" name="mittag" value="ja" checked> Ja</label>
                   <label><input type="radio" name="mittag" value="nein"> Nein</label>
                 </div>`;
      }
    }

    html += `<div class="footer">
               <button class="btn-abbrechen">Abbrechen</button>
               ${nurMittag ? '' : '<button class="btn-save">Speichern</button>'}
             </div>`;

    dlg.innerHTML = html;
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);

    const sammleUndSpeichern = async (mittagGemacht) => {
      const kommen = fehltKommen ? dlg.querySelector('.np-kommen')?.value : null;
      const gehen  = fehltGehen  ? dlg.querySelector('.np-gehen')?.value  : null;
      await _nachstempelSave(check, 'anwesend', kommen, gehen, mittagGemacht);
      overlay.remove(); resolve();
    };

    if (nurMittag) {
      dlg.querySelector('.np-mittag-ja').onclick = () => sammleUndSpeichern(true);
      dlg.querySelector('.np-mittag-nein').onclick = () => sammleUndSpeichern(false);
    } else {
      dlg.querySelector('.btn-save').onclick = async () => {
        let mittag = null;
        if (fehltMittag) {
          const sel = dlg.querySelector('input[name="mittag"]:checked');
          mittag = sel ? (sel.value === 'ja') : true;
        }
        await sammleUndSpeichern(mittag);
      };
    }

    dlg.querySelector('.btn-abbrechen').onclick = async () => {
      await _nachstempelDismiss(check);
      overlay.remove(); resolve();
    };
  });
}

async function _nachstempelSave(check, antwort, kommen, gehen, mittag) {
  try {
    const body = {
      datum: check.datum,
      antwort,
      kommen_zeit: kommen || null,
      gehen_zeit: gehen || null,
      mittag_gemacht: mittag
    };
    body[check.person.typ === 'mitarbeiter' ? 'mitarbeiter_id' : 'lehrling_id'] = check.person.id;
    await ApiService.post('/tagesstempel/nachstempel', body);
  } catch (e) {
    console.error('[Nachstempel-Save] Fehler:', e);
    alert('Speichern fehlgeschlagen');
  }
}

async function _nachstempelDismiss(check) {
  try {
    const body = { datum: check.datum };
    body[check.person.typ === 'mitarbeiter' ? 'mitarbeiter_id' : 'lehrling_id'] = check.person.id;
    await ApiService.post('/tagesstempel/nachstempel/dismiss', body);
  } catch (e) {
    console.error('[Nachstempel-Dismiss] Fehler:', e);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron-intern-tablet/index.html
git commit -m "feat(tablet): showNachstempelDialog mit allen Varianten"
```

---

## Task 13: Tablet — Auslöser nach tagesstempelKommen

**Files:**
- Modify: `electron-intern-tablet/index.html`

- [ ] **Step 1: `tagesstempelKommen` erweitern**

In `electron-intern-tablet/index.html`, Funktion `tagesstempelKommen(personId, typ)` (ca. Zeile 3051):

**Vorher:**
```js
async function tagesstempelKommen(personId, typ) {
    const body = { [`${typ}_id`]: personId };
    try {
        await ApiService.post('/tagesstempel/kommen', body);
        // ...
    } catch (e) {
        console.error('[Tagesstempel-Kommen] Fehler:', e);
    }
}
```

**Nachher:**
```js
async function tagesstempelKommen(personId, typ) {
    const body = { [`${typ}_id`]: personId };
    try {
        await ApiService.post('/tagesstempel/kommen', body);

        // Nachstempel-Check für letzten Soll-Tag (nie blockierend)
        try {
            const check = await ApiService.get(`/tagesstempel/nachstempel-check?${typ}_id=${personId}`);
            if (check && check.nachstempel_noetig) {
                await showNachstempelDialog(check);
            }
        } catch (checkErr) {
            console.error('[Nachstempel-Check] Fehler (ignoriert):', checkErr);
        }
    } catch (e) {
        console.error('[Tagesstempel-Kommen] Fehler:', e);
    }
}
```

- [ ] **Step 2: Smoke-Test lokal**

Electron-App lokal starten (`cd electron-intern-tablet && npm start` oder wie im Projekt vorgesehen).

Testszenario:
1. Im Backend testen via DB direkt: `UPDATE tagesstempel SET nachgefragt_am = NULL WHERE mitarbeiter_id = 1 AND datum = '<gestern>'` und `DELETE FROM pause_tracking WHERE mitarbeiter_id = 1 AND datum = '<gestern>'`
2. Im Tablet: Person 1 "Kommen" drücken → Dialog erscheint für gelben Tag
3. Mittag "Ja" klicken → Dialog schließt, Zeitkonto im Web aktualisiert sich (via WebSocket)

- [ ] **Step 3: Commit**

```bash
git add electron-intern-tablet/index.html
git commit -m "feat(tablet): Nachstempel-Check nach Kommen-Stempel"
```

---

## Task 14: Version-Bump + Tablet-Update-Build

**Files:**
- Modify: `electron-intern-tablet/package.json`

- [ ] **Step 1: Version erhöhen**

Öffne `electron-intern-tablet/package.json`, lies aktuelle Version, erhöhe die letzte Zahl (z.B. `1.9.3` → `1.9.4`). Exakte Version merken für Build-Schritt.

- [ ] **Step 2: Build ausführen**

```bash
cd electron-intern-tablet && npm run build
```
Expected: Installer wird in `electron-intern-tablet/dist/Werkstatt-Intern-Setup-X.Y.Z-ia32.exe` erzeugt.

- [ ] **Step 3: Commit Version-Bump**

```bash
git add electron-intern-tablet/package.json
git commit -m "chore(tablet): version bump X.Y.Z für Nachstempel-Feature"
```

Hinweis: Der eigentliche Upload + Registrierung beim Backend (siehe CLAUDE.md §5) geschieht erst beim Deployment, nicht als Teil des Implementation-Plans.

---

## Task 15: Abschluss — Full-Testlauf & index.html-Check

**Files:** alle

- [ ] **Step 1: Alle Backend-Tests**

```bash
cd backend && npm test
```
Expected: alle PASS, keine Regression.

- [ ] **Step 2: Frontend-Build**

```bash
cd frontend && npm run build
```
Expected: Build-Erfolg.

- [ ] **Step 3: index.html-Tab-Check (PowerShell)**

```powershell
foreach ($tab in @("dashboard","heute","termine","kalender","kunden","zeitverwaltung","zeitstempelung","auslastung","intern","papierkorb","einstellungen")) {
  if (!(Select-String -Path "frontend/index.html" -Pattern "data-tab=`"$tab`"" -Quiet)) { Write-Host "FEHLT: $tab" -ForegroundColor Red }
}
```
Expected: keine Ausgabe.

- [ ] **Step 4: Manuelle Checkliste abhaken**

Per CLAUDE.md-Pattern:
1. Mitarbeiter stempelt Kommen → kein Dialog (gestern war grün)
2. Chef löscht gestrigen Gehen → Mitarbeiter stempelt morgen → Dialog mit Gehen-Default
3. Speichern → Zeitkonto zeigt grün, Saldo neu berechnet
4. Abbrechen → Zeitkonto weiter orange, kein Re-Nag am nächsten Tag
5. Chef setzt für gestern nichts → Mitarbeiter kommt → "Warst du da?" Nein → roter Tag bleibt
6. Zeitkonto: Klick auf gelben Punkt → Inline-Panel öffnet → Mittag nachtragen → grün
7. Legende oberhalb sichtbar
8. WebSocket: Tablet A antwortet, Web-Zeitkonto aktualisiert sich

- [ ] **Step 5: Abschluss-Commit (falls nötig) und Finalreview**

```bash
git log --oneline -20
```
Expected: ~11 neue Commits mit sprechenden Nachrichten.

---

## Rollout-Checkliste (nach Implementierung)

Der eigentliche Deploy-Workflow ist in `CLAUDE.md §5` beschrieben. Relevante Schritte nach erfolgreicher Implementation:

1. `npm test` lokal grün
2. DB-Backup auf Produktivserver erstellen (siehe CLAUDE.md)
3. Frontend-Assets hochladen (neue Hash-Namen!)
4. Backend-Update + Restart
5. Migration 036 läuft automatisch beim Serverstart
6. Tablet-Installer hochladen + Update registrieren (siehe CLAUDE.md Tablet-Update-Abschnitt)
7. Werkstatt-Tablets installieren Update nach Neustart
