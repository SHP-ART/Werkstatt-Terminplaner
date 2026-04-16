const { createTestDb, closeTestDb, dbRun, dbGet, dbAll } = require('./helpers/testSetup');

describe('Stempelzeiten', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    await dbRun(db, `ALTER TABLE termine_arbeiten ADD COLUMN stempel_start TEXT`).catch(() => {});
    await dbRun(db, `ALTER TABLE termine_arbeiten ADD COLUMN stempel_ende TEXT`).catch(() => {});
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
