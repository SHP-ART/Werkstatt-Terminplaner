/**
 * Migration 026 - ki_zeitlern_enabled
 * Fügt den Toggle für die KI-Lernkurven-Funktion in werkstatt_einstellungen hinzu.
 * Wenn deaktiviert, werden beim Terminabschluss keine Lerndaten in ki_zeitlern_daten gespeichert.
 */
const { safeAlterTable, safeRun } = require('./helpers');

const migration = {
  version: 26,
  description: 'KI-Zeitlern aktivieren/deaktivieren Toggle'
};

async function up(db) {
  console.log('Migration 026: Füge ki_zeitlern_enabled Spalte hinzu...');
  await safeAlterTable(
    db,
    `ALTER TABLE werkstatt_einstellungen ADD COLUMN ki_zeitlern_enabled INTEGER DEFAULT 1`,
    'ki_zeitlern_enabled Spalte'
  );
  await safeRun(
    db,
    `UPDATE werkstatt_einstellungen SET ki_zeitlern_enabled = 1 WHERE id = 1 AND ki_zeitlern_enabled IS NULL`,
    'ki_zeitlern_enabled Standardwert'
  );
  console.log('✓ Migration 026 abgeschlossen');
}

async function down(db) {
  console.log('Migration 026: Rückgängig – Spalte kann in SQLite nicht gelöscht werden, wird ignoriert.');
}

migration.up = up;
migration.down = down;

module.exports = migration;
