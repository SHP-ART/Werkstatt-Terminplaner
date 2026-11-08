const {
  TEST_DB,
  createTestDb,
  closeTestDb,
  dbRun,
  dbAll
} = require('./helpers/testSetup');

process.env.DB_PATH = TEST_DB;
process.env.NODE_ENV = 'test';

let db;
let dbWrapper;
let berechneZeitenFuerPerson;

beforeAll(async () => {
  db = await createTestDb();
  ({ berechneZeitenFuerPerson } = require('../src/services/zeitplanungService'));
  dbWrapper = require('../src/config/database').dbWrapper;
  await dbWrapper.readyPromise;
});

beforeEach(async () => {
  await dbRun(db, 'DELETE FROM termine');
  await dbRun(db, 'DELETE FROM mitarbeiter');
  await dbRun(db, 'DELETE FROM lehrlinge');
  await dbRun(db, `INSERT OR REPLACE INTO werkstatt_einstellungen (
    id, nebenzeit_prozent, mittagspause_minuten
  ) VALUES (1, 0, 30)`);
});

afterAll(async () => {
  if (dbWrapper?.connection) {
    await new Promise((resolve, reject) => {
      dbWrapper.connection.close(error => error ? reject(error) : resolve());
    });
    dbWrapper.connection = null;
  }
  await closeTestDb(db);
  delete process.env.DB_PATH;
});

test('verarbeitet Queue-Zettel nach Position und veraendert bring_zeit nicht', async () => {
  await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv, arbeitsstunden_pro_tag)
    VALUES (1, 'Mechaniker 1', 1, 8)`);
  await dbRun(db, `INSERT INTO termine
    (id, termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, status,
     mitarbeiter_id, warteschlange_pos, startzeit, bring_zeit)
    VALUES (1, 'T-1', 'AB-1', '2026-11-09', 60, 'Inspektion', 'geplant',
     1, 1, '10:00', '09:00'), (2, 'T-2', 'AB-2', '2026-11-09', 30, 'Bremsen',
     'geplant', 1, 2, '09:00', '08:00')`);

  const ergebnis = await berechneZeitenFuerPerson({
    personId: 1, personTyp: 'mitarbeiter', datum: '2026-11-09', startTerminId: null
  });

  expect(ergebnis.success).toBe(true);
  const zettel = await dbAll(db, 'SELECT * FROM termine ORDER BY warteschlange_pos');
  expect(zettel[0].startzeit).toBe('09:00');
  expect(zettel[0].bring_zeit).toBe('09:00');
  expect(zettel[1].startzeit).toBe(zettel[0].endzeit_berechnet);
  expect(zettel[1].bring_zeit).toBe('08:00');
});

test('laufender Queue-Zettel behaelt seinen tatsaechlichen Start', async () => {
  await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv, arbeitsstunden_pro_tag)
    VALUES (1, 'Mechaniker 1', 1, 8)`);
  await dbRun(db, `INSERT INTO termine
    (id, termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, status,
     mitarbeiter_id, warteschlange_pos, startzeit, bring_zeit)
    VALUES (1, 'T-1', 'AB-1', '2026-11-09', 60, 'Inspektion', 'in_arbeit',
     1, 1, '10:15', '09:00')`);

  await berechneZeitenFuerPerson({
    personId: 1, personTyp: 'mitarbeiter', datum: '2026-11-09', startTerminId: 1
  });

  const zettel = await dbAll(db, 'SELECT * FROM termine WHERE id = 1');
  expect(zettel[0].startzeit).toBe('10:15');
  expect(zettel[0].endzeit_berechnet).toBe('11:15');
});

test('Lehrlings-Gesamtzuordnung verwendet die Aufgabenbewaeltigung', async () => {
  await dbRun(db, `INSERT INTO lehrlinge (
    id, name, aktiv, arbeitsstunden_pro_tag, aufgabenbewaeltigung_prozent
  ) VALUES (1, 'Lehrling 1', 1, 8, 150)`);
  await dbRun(db, `INSERT INTO termine
    (id, termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, status,
     lehrling_id, warteschlange_pos, startzeit, bring_zeit, arbeitszeiten_details)
    VALUES (1, 'T-1', 'AB-1', '2026-11-09', 60, 'Inspektion', 'geplant',
     1, 1, '08:00', '08:00', ?)`,
  [JSON.stringify({ _gesamt_mitarbeiter_id: { type: 'lehrling', id: 1 } })]);

  await berechneZeitenFuerPerson({
    personId: 1, personTyp: 'lehrling', datum: '2026-11-09', startTerminId: null
  });

  const zettel = await dbAll(db, 'SELECT * FROM termine WHERE id = 1');
  expect(zettel[0].endzeit_berechnet).toBe('09:30');
});
