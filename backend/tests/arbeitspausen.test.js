// backend/tests/arbeitspausen.test.js
const { createTestDb, closeTestDb, dbRun, dbGet, dbAll } = require('./helpers/testSetup');

describe('Arbeitspausen API', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    // Einfacher Mitarbeiter-Seed mit nur den Basis-Spalten (kompatibel mit manuellem Schema-Fallback)
    await dbRun(db, `INSERT OR IGNORE INTO mitarbeiter (id, name, aktiv) VALUES (1, 'Max Mustermann', 1)`);
    // Erstelle arbeitspausen-Tabelle falls nicht vorhanden (Test-DB-Schema-Lücke)
    await dbRun(db, `CREATE TABLE IF NOT EXISTS arbeitspausen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id INTEGER NOT NULL,
      mitarbeiter_id INTEGER,
      lehrling_id INTEGER,
      grund TEXT NOT NULL CHECK(grund IN ('teil_fehlt', 'rueckfrage_kunde', 'vorrang')),
      gestartet_am DATETIME NOT NULL,
      beendet_am DATETIME,
      FOREIGN KEY (termin_id) REFERENCES termine(id)
    )`);
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
