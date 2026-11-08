const {
  createTestDb,
  closeTestDb,
  dbAll
} = require('./helpers/testSetup');
const migration052 = require('../migrations/052_warteschlange_pos');
const { getAllMigrations } = require('../migrations');

describe('Migration 052 — Warteschlangenposition', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  test('fügt warteschlange_pos und den zusammengesetzten Index hinzu', async () => {
    await migration052.up(db);

    const columns = await dbAll(db, 'PRAGMA table_info(termine)');
    const position = columns.find(column => column.name === 'warteschlange_pos');
    expect(position).toBeDefined();
    expect(position.type).toBe('INTEGER');
    expect(position.notnull).toBe(0);

    const indexes = await dbAll(db, "PRAGMA index_list('termine')");
    const queueIndex = indexes.find(index => index.name === 'idx_termine_warteschlange');
    expect(queueIndex).toBeDefined();

    const indexColumns = await dbAll(db, "PRAGMA index_info('idx_termine_warteschlange')");
    expect(indexColumns.map(column => column.name)).toEqual([
      'mitarbeiter_id',
      'warteschlange_pos'
    ]);
  });

  test('ist im produktiven Migration-Runner registriert', () => {
    const registered = getAllMigrations().find(migration => migration.version === 52);
    expect(registered).toBe(migration052);
  });
});
