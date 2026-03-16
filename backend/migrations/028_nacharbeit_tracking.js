/**
 * Migration 028: Nacharbeit-Tracking
 *
 * Fügt hinzu:
 * - Spalte `nacharbeit_start_zeit` in `termine`: Zeitpunkt (HH:MM) der Neu-Zuordnung
 *   auf heute. Wird automatisch gesetzt, wenn ein Termin vom Vortag/früheren Datum
 *   auf das aktuelle Datum verschoben wird (= Nacharbeit).
 *   Zusammen mit dem vorhandenen `muss_bearbeitet_werden`-Flag ergibt sich:
 *     - muss_bearbeitet_werden = 1  → Termin ist eine Nacharbeit
 *     - nacharbeit_start_zeit = "HH:MM" → Zeitpunkt der Neu-Zuordnung heute
 */

const { safeRun } = require('./helpers');

const migration = {
  version: 28,
  description: 'Nacharbeit-Tracking: nacharbeit_start_zeit in termine-Tabelle'
};

async function up(db) {
  console.log('Migration 028: Füge nacharbeit_start_zeit zu termine hinzu...');

  await safeRun(db, `
    ALTER TABLE termine ADD COLUMN nacharbeit_start_zeit TEXT
  `);

  await safeRun(db, `
    CREATE INDEX IF NOT EXISTS idx_termine_nacharbeit
    ON termine(datum, muss_bearbeitet_werden)
    WHERE muss_bearbeitet_werden = 1
  `);

  console.log('✓ Migration 028 abgeschlossen');
}

async function down(db) {
  console.log('Migration 028: Rückgängig (Spalte kann in SQLite nicht entfernt werden – ignoriert)');
  await safeRun(db, 'DROP INDEX IF EXISTS idx_termine_nacharbeit');
  console.log('✓ Migration 028 rückgängig gemacht (Index entfernt)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
