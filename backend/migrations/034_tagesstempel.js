const { safeRun } = require('./helpers');

const migration = {
  version: 34,
  description: 'Tagesstempel + Arbeitsunterbrechungen: Arbeitsbeginn/Arbeitsende/Unterbrechungen pro Person und Tag'
};

async function up(db) {
  console.log('Migration 034: Erstelle tagesstempel + arbeitsunterbrechungen...');

  await safeRun(db, `
    CREATE TABLE IF NOT EXISTS tagesstempel (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER REFERENCES mitarbeiter(id) ON DELETE SET NULL,
      lehrling_id    INTEGER REFERENCES lehrlinge(id)   ON DELETE SET NULL,
      datum          TEXT NOT NULL,
      kommen_zeit    TEXT NOT NULL,
      gehen_zeit     TEXT,
      erstellt_am    TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL)
    )
  `);

  await safeRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_tagesstempel_ma_datum ON tagesstempel(mitarbeiter_id, datum) WHERE mitarbeiter_id IS NOT NULL`);
  await safeRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_tagesstempel_ll_datum ON tagesstempel(lehrling_id, datum) WHERE lehrling_id IS NOT NULL`);

  await safeRun(db, `
    CREATE TABLE IF NOT EXISTS arbeitsunterbrechungen (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER REFERENCES mitarbeiter(id) ON DELETE SET NULL,
      lehrling_id    INTEGER REFERENCES lehrlinge(id)   ON DELETE SET NULL,
      datum          TEXT NOT NULL,
      start_zeit     TEXT NOT NULL,
      ende_zeit      TEXT,
      erstellt_am    TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL)
    )
  `);

  await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_arbeitsunterb_datum ON arbeitsunterbrechungen(datum)`);

  console.log('✓ Migration 034 abgeschlossen');
}

async function down(db) {
  await safeRun(db, `DROP INDEX IF EXISTS idx_arbeitsunterb_datum`);
  await safeRun(db, `DROP TABLE IF EXISTS arbeitsunterbrechungen`);
  await safeRun(db, `DROP INDEX IF EXISTS idx_tagesstempel_ll_datum`);
  await safeRun(db, `DROP INDEX IF EXISTS idx_tagesstempel_ma_datum`);
  await safeRun(db, `DROP TABLE IF EXISTS tagesstempel`);
  console.log('✓ Migration 034 rückgängig gemacht');
}

migration.up = up;
migration.down = down;

module.exports = migration     CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL)
    )
  `);

  await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_arbeitsunterb_datum ON arbeitsunterbrechungen(datum)`);

  console.log('✓ Migration 034 abgeschlossen');
}

async function down(db) {
  await safeRun(db, `DROP INDEX IF EXISTS idx_arbeitsunterb_datum`);
  await safeRun(db, `DROP TABLE IF EXISTS arbeitsunterbrechungen`);
  await safeRun(db, `DROP INDEX IF EXISTS idx_tagesstempel_ll_datum`);
  await safeRun(db, `DROP INDEX IF EXISTS idx_tagesstempel_ma_datum`);
  await safeRun(db, `DROP TABLE IF EXISTS tagesstempel`);
  console.log('✓ Migration 034 rückgängig gemacht');
}

migration.up = up;
migration.down = down;

module.exports = migration;
