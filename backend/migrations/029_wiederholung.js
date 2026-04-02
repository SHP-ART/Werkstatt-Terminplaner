/**
 * Migration 029: Wiederholungstermin-Flag
 *
 * Fügt hinzu:
 * - Spalte `ist_wiederholung` in `termine`: INTEGER DEFAULT 0
 *   Flag um zu kennzeichnen, ob dieser Termin ein Wiederholungstermin ist
 * - Index auf (ist_wiederholung, datum) mit WHERE-Clause für Performance
 */

const { safeRun } = require('./helpers');

const migration = {
  version: 29,
  description: 'Wiederholungstermin-Flag: ist_wiederholung in termine-Tabelle'
};

async function up(db) {
  console.log('Migration 029: Füge ist_wiederholung zu termine hinzu...');

  await safeRun(db, `
    ALTER TABLE termine ADD COLUMN ist_wiederholung INTEGER DEFAULT 0
  `);

  await safeRun(db, `
    CREATE INDEX IF NOT EXISTS idx_termine_wiederholung
    ON termine(ist_wiederholung, datum)
    WHERE ist_wiederholung = 1
  `);

  console.log('✓ Migration 029 abgeschlossen');
}

async function down(db) {
  console.log('Migration 029: Rückgängig (Spalte kann in SQLite nicht entfernt werden – ignoriert)');
  await safeRun(db, 'DROP INDEX IF EXISTS idx_termine_wiederholung');
  console.log('✓ Migration 029 rückgängig gemacht (Index entfernt)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
