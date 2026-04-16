/**
 * Migration 031: lehrling_id zur termine-Tabelle hinzufügen
 *
 * Fügt hinzu:
 * - Spalte `lehrling_id` in der `termine`-Tabelle (INTEGER, optional)
 *   Referenz auf lehrlinge(id) – ermöglicht direkte Lehrlings-Zuordnung
 *   für splitTermin und Folgearbeit-Funktionen.
 */

const { safeAlterTable } = require('./helpers');

const migration = {
  version: 31,
  description: 'termine: lehrling_id Spalte für direkte Lehrlings-Zuordnung'
};

async function up(db) {
  console.log('Migration 031: Füge lehrling_id zu termine hinzu...');

  await safeAlterTable(
    db,
    'ALTER TABLE termine ADD COLUMN lehrling_id INTEGER REFERENCES lehrlinge(id)',
    'termine.lehrling_id'
  );

  console.log('✓ Migration 031 abgeschlossen');
}

async function down(db) {
  // SQLite unterstützt kein DROP COLUMN in älteren Versionen
  // Die Spalte bleibt bestehen, ist aber harmlos
  console.log('Migration 031 down: lehrling_id kann in SQLite nicht entfernt werden (ignoriert)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
