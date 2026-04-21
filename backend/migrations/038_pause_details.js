const { safeRun } = require('./helpers');

const migration = {
  version: 38,
  description: 'Pause-Details: Termin-Zuordnung + Grund fuer Pausen/Unterbrechungen'
};

async function up(db) {
  console.log('Migration 038: Pause-Details (termin_id, grund)...');
  // pause_tracking: aktueller Termin (laeuft gerade beim Pause-Start)
  await safeRun(db, `ALTER TABLE pause_tracking ADD COLUMN pause_aktueller_termin_id INTEGER DEFAULT NULL`);
  // arbeitsunterbrechungen: Grund + Termin-Zuordnung
  await safeRun(db, `ALTER TABLE arbeitsunterbrechungen ADD COLUMN grund TEXT DEFAULT NULL`);
  await safeRun(db, `ALTER TABLE arbeitsunterbrechungen ADD COLUMN termin_id INTEGER DEFAULT NULL`);
  console.log('✓ Migration 038 abgeschlossen');
}

async function down(db) {
  console.log('✓ Migration 038 rueckgaengig (Spalten bleiben bestehen)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
