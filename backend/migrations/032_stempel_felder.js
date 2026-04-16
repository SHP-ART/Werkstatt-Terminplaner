/**
 * Migration 032: Stempel-Felder für Zeitstempelung
 *
 * Fügt hinzu:
 * - Spalte `stempel_start` in der `termine_arbeiten`-Tabelle (TEXT, optional)
 *   Speichert den Startzeitstempel im Format HH:MM (z.B. "08:15")
 * - Spalte `stempel_ende` in der `termine_arbeiten`-Tabelle (TEXT, optional)
 *   Speichert den Endzeitstempel im Format HH:MM (z.B. "12:30")
 *
 * Ermöglicht ein "Zeitstempelung"-Tab, das tägliche Stempel-Records pro
 * Mitarbeiter/Aufgabe anzeigt.
 */

const { safeAlterTable } = require('./helpers');

const migration = {
  version: 32,
  description: 'Stempel-Felder: stempel_start und stempel_ende in termine_arbeiten'
};

async function up(db) {
  console.log('Migration 032: Füge stempel_start/stempel_ende zu termine_arbeiten hinzu...');

  await safeAlterTable(
    db,
    'ALTER TABLE termine_arbeiten ADD COLUMN stempel_start TEXT',
    'termine_arbeiten.stempel_start'
  );

  await safeAlterTable(
    db,
    'ALTER TABLE termine_arbeiten ADD COLUMN stempel_ende TEXT',
    'termine_arbeiten.stempel_ende'
  );

  console.log('✓ Migration 032 abgeschlossen');
}

async function down(db) {
  // SQLite unterstützt kein DROP COLUMN in älteren Versionen
  // Die Spalten bleiben bestehen, sind aber harmlos
  console.log('Migration 032 down: stempel_start/stempel_ende können in SQLite nicht entfernt werden (ignoriert)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
