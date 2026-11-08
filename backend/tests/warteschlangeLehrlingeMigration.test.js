const {
  createTestDb,
  closeTestDb,
  dbAll,
  dbRun
} = require('./helpers/testSetup');
const migration053 = require('../migrations/053_warteschlange_lehrlinge');
const { getAllMigrations } = require('../migrations');

describe('Migration 053 — Lehrlings-Warteschlangenindex', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    await dbRun(db, 'DROP INDEX IF EXISTS idx_termine_warteschlange_lehrlinge');
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  test('erstellt den zusammengesetzten Lehrlings-Index', async () => {
    await migration053.up(db);

    const indexes = await dbAll(db, "PRAGMA index_list('termine')");
    expect(indexes.some(index => index.name === 'idx_termine_warteschlange_lehrlinge')).toBe(true);
    const columns = await dbAll(db, "PRAGMA index_info('idx_termine_warteschlange_lehrlinge')");
    expect(columns.map(column => column.name)).toEqual(['lehrling_id', 'warteschlange_pos']);
  });

  test('ist im produktiven Migration-Runner registriert', () => {
    expect(getAllMigrations().find(migration => migration.version === 53)).toBe(migration053);
  });
});
