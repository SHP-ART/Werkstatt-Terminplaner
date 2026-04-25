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

  // Edge Case
  test('Edge: kein Soll aber gestempelt → kein_punkt (nicht bewertet)', () => {
    expect(berechneTagesStatus({ sollMin: 0, abwTyp: null, hatKommen: true, hatGehen: true, hatMittag: true }).status).toBe('kein_punkt');
  });
});
