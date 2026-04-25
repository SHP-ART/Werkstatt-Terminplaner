// backend/tests/nachstempel.test.js
const { createTestDb, closeTestDb, dbRun, dbGet, dbAll } = require('./helpers/testSetup');
const migration036 = require('../migrations/036_nachgefragt_am');

// Voraussetzung: tagesstempel-Tabelle existiert in Test-DB im ALTEN Schema (NOT NULL kommen_zeit)
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
    // Sicher gehen, dass tagesstempel im alten Schema vorliegt:
    await dbRun(db, `DROP TABLE IF EXISTS tagesstempel`);
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
