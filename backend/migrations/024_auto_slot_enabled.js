/**
 * Migration 024: Auto-Slot-Suche Einstellung
 *
 * Fügt hinzu:
 * - Feld auto_slot_enabled in werkstatt_einstellungen
 */

const { safeRun } = require('./helpers');

const migration = {
  version: 24,
  description: 'Auto-Slot-Suche: auto_slot_enabled Einstellungsfeld'
};

async function up(db) {
  console.log('Migration 024: Füge auto_slot_enabled hinzu...');
  await safeRun(db, `ALTER TABLE werkstatt_einstellungen ADD COLUMN auto_slot_enabled INTEGER DEFAULT 1`);
  console.log('✓ Migration 024 abgeschlossen');
}

async function down(db) {
  console.log('Migration 024: Rückgängig (Spalte bleibt in SQLite)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
