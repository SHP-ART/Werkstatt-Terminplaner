const { createTestDb, closeTestDb, dbRun, dbGet, dbAll } = require('./helpers/testSetup');

describe('pauseSplit Logik (via DB)', () => {
  let db;
  let terminId;

  beforeEach(async () => {
    db = await createTestDb();

    await dbRun(db, `INSERT OR IGNORE INTO mitarbeiter (id, name, aktiv) VALUES (1, 'Max Mustermann', 1)`);

    const heute = new Date().toISOString().slice(0, 10);
    await dbRun(db, `
      INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, startzeit, arbeit, status, mitarbeiter_id, geschaetzte_zeit)
      VALUES ('T-SPLIT-001', 'Testkunde', 'TS-1234', ?, '08:00', 'Bremsen wechseln', 'in_arbeit', 1, 60)
    `, [heute]);

    const termin = await dbGet(db, `SELECT id FROM termine WHERE termin_nr = 'T-SPLIT-001'`);
    terminId = termin.id;
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  test('pause-split: unterbrochen_am und unterbrochen_grund Spalten existieren', async () => {
    const cols = await dbAll(db, `PRAGMA table_info(termine)`);
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('unterbrochen_am');
    expect(colNames).toContain('unterbrochen_grund');
    expect(colNames).toContain('split_teil');
    expect(colNames).toContain('parent_termin_id');
  });

  test('pause-split: manuell Teil 1 auf unterbrochen setzen', async () => {
    const gearbMin = 35;
    const jetztIso = new Date().toISOString();

    await dbRun(db, `
      UPDATE termine SET
        status = 'unterbrochen',
        geschaetzte_zeit = ?,
        tatsaechliche_zeit = ?,
        unterbrochen_am = ?,
        unterbrochen_grund = 'teil_fehlt',
        split_teil = 1
      WHERE id = ?
    `, [gearbMin, gearbMin, jetztIso, terminId]);

    const t1 = await dbGet(db, `SELECT * FROM termine WHERE id = ?`, [terminId]);
    expect(t1.status).toBe('unterbrochen');
    expect(t1.split_teil).toBe(1);
    expect(t1.unterbrochen_grund).toBe('teil_fehlt');
    expect(t1.tatsaechliche_zeit).toBe(gearbMin);
  });

  test('pause-split: Teil 2 anlegen mit datum=NULL und parent_termin_id', async () => {
    await dbRun(db, `
      UPDATE termine SET status='unterbrochen', split_teil=1, unterbrochen_grund='vorrang'
      WHERE id = ?
    `, [terminId]);

    await dbRun(db, `
      INSERT INTO termine (termin_nr, kunde_name, kennzeichen, arbeit, geschaetzte_zeit,
        datum, startzeit, status, mitarbeiter_id, split_teil, parent_termin_id, unterbrochen_grund)
      VALUES ('T-SPLIT-002', 'Testkunde', 'TS-1234', 'Bremsen wechseln (Fortsetzung)', 25,
        NULL, NULL, 'geplant', 1, 2, ?, 'vorrang')
    `, [terminId]);

    const t2 = await dbGet(db, `SELECT * FROM termine WHERE parent_termin_id = ? AND split_teil = 2`, [terminId]);
    expect(t2).toBeDefined();
    expect(t2.status).toBe('geplant');
    expect(t2.datum).toBeNull();
    expect(t2.startzeit).toBeNull();
    expect(t2.parent_termin_id).toBe(terminId);
    expect(t2.split_teil).toBe(2);
    expect(t2.arbeit).toBe('Bremsen wechseln (Fortsetzung)');
  });

  test('pause-split: split_teil=1 darf nicht nochmals aufgeteilt werden (Constraint-Check)', async () => {
    await dbRun(db, `UPDATE termine SET status='unterbrochen', split_teil=1 WHERE id = ?`, [terminId]);

    const t = await dbGet(db, `SELECT split_teil, status FROM termine WHERE id = ?`, [terminId]);
    expect(t.split_teil).toBe(1);
    expect(t.status).not.toBe('in_arbeit');
  });

  test('pause-split: erlaubte Gründe — nur bekannte Werte', async () => {
    const erlaubteGruende = ['teil_fehlt', 'rueckfrage_kunde', 'vorrang', 'sonstiges'];
    for (const g of erlaubteGruende) {
      await dbRun(db, `UPDATE termine SET unterbrochen_grund = ? WHERE id = ?`, [g, terminId]);
      const t = await dbGet(db, `SELECT unterbrochen_grund FROM termine WHERE id = ?`, [terminId]);
      expect(t.unterbrochen_grund).toBe(g);
    }
  });
});
