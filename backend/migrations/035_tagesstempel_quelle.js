const { safeRun } = require('./helpers');

const migration = {
  version: 35,
  description: 'Tagesstempel: kommen_quelle + gehen_quelle (stempel/manuell/auto)'
};

async function up(db) {
  console.log('Migration 035: Füge quelle-Spalten zu tagesstempel hinzu...');
  await safeRun(db, `ALTER TABLE tagesstempel ADD COLUMN kommen_quelle TEXT DEFAULT NULL`);
  await safeRun(db, `ALTER TABLE tagesstempel ADD COLUMN gehen_quelle  TEXT DEFAULT NULL`);
  console.log('✓ Migration 035 abgeschlossen');
}

async function down(db) {
  // SQLite unterstützt kein DROP COLUMN vor Version 3.35
  // Wir lassen die Spalten bestehen – sie sind NULL-safe und stören nicht
  console.log('✓ Migration 035 rückgängig gemacht (Spalten bleiben erhalten)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
