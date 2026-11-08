const {
  TEST_DB,
  createTestDb,
  closeTestDb,
  dbRun,
  dbAll
} = require('./helpers/testSetup');

process.env.DB_PATH = TEST_DB;
process.env.NODE_ENV = 'test';

jest.mock('../src/utils/websocket', () => ({
  broadcastEvent: jest.fn(),
  setWebSocketServer: jest.fn()
}));

const express = require('express');
const request = require('supertest');

let db;
let dbWrapper;
let migration054;

beforeAll(async () => {
  db = await createTestDb();
  try {
    migration054 = require('../migrations/054_ki_lern_daten_unique');
  } catch (_) {}
  if (migration054) await migration054.up(db);

  const stempelColumns = await dbAll(db, 'PRAGMA table_info(termine_arbeiten)');
  if (!stempelColumns.some(column => column.name === 'stempel_start')) {
    await dbRun(db, 'ALTER TABLE termine_arbeiten ADD COLUMN stempel_start TEXT');
    await dbRun(db, 'ALTER TABLE termine_arbeiten ADD COLUMN stempel_ende TEXT');
  }

  await dbRun(db, "INSERT INTO mitarbeiter (id, name, aktiv) VALUES (1, 'Test', 1)");
  await dbRun(db, `INSERT INTO termine (
    id, termin_nr, kunde_name, kennzeichen, datum, arbeit, status, mitarbeiter_id, geschaetzte_zeit
  ) VALUES (1, 'T-TEST-KI', 'Test', 'AB-123', '2026-11-09', 'Ölwechsel', 'in_arbeit', 1, 60)`);
  await dbRun(db, `INSERT INTO termine_arbeiten (
    termin_id, arbeit, zeit, mitarbeiter_id, reihenfolge, stempel_start
  ) VALUES (1, 'Ölwechsel', 60, 1, 0, '08:00')`);
  await dbRun(db, 'INSERT OR REPLACE INTO werkstatt_einstellungen (id, ki_zeitlern_enabled) VALUES (1, 1)');

  const stempelzeitenRoutes = require('../src/routes/stempelzeitenRoutes');
  dbWrapper = require('../src/config/database').dbWrapper;
  await dbWrapper.readyPromise;
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

describe('KI-Lerndaten-Idempotenz', () => {
  test('Wiederholtes Stempel-Ende aktualisiert denselben Lernpunkt', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/stempelzeiten', require('../src/routes/stempelzeitenRoutes'));

    await request(app)
      .put('/api/stempelzeiten/stempel')
      .send({ termin_id: 1, arbeit_name: 'Ölwechsel', stempel_ende: '09:00' })
      .expect(200);
    await request(app)
      .put('/api/stempelzeiten/stempel')
      .send({ termin_id: 1, arbeit_name: 'Ölwechsel', stempel_ende: '10:00' })
      .expect(200);

    const rows = await dbAll(db, `SELECT tatsaechliche_min FROM ki_zeitlern_daten WHERE termin_id = 1 AND arbeit = 'Ölwechsel'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].tatsaechliche_min).toBe(120);
  });

  test('Migration führt vorhandene Duplikate zu einem aktuellen Lernpunkt zusammen', async () => {
    expect(migration054).toBeDefined();
    await dbRun(db, 'DROP INDEX IF EXISTS idx_ki_lern_termin_arbeit_unique');
    await dbRun(db, 'DELETE FROM ki_zeitlern_daten');
    await dbRun(db, `INSERT INTO ki_zeitlern_daten (
      termin_id, arbeit, kategorie, geschaetzte_min, tatsaechliche_min, datum
    ) VALUES (1, 'Ölwechsel', 'Sonstiges', 60, 60, '2026-11-09')`);
    await dbRun(db, `INSERT INTO ki_zeitlern_daten (
      termin_id, arbeit, kategorie, geschaetzte_min, tatsaechliche_min, datum
    ) VALUES (1, 'Ölwechsel', 'Sonstiges', 60, 120, '2026-11-09')`);

    await migration054.up(db);

    const rows = await dbAll(db, `SELECT tatsaechliche_min FROM ki_zeitlern_daten WHERE termin_id = 1 AND arbeit = 'Ölwechsel'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].tatsaechliche_min).toBe(120);
  });
});
