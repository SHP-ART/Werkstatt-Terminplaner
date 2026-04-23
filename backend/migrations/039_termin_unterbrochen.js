const { safeRun } = require('./helpers');

const migration = {
  version: 39,
  description: 'Auftrag-Split: unterbrochen_am + unterbrochen_grund Felder in termine'
};

async function up(db) {
  console.log('Migration 039: Füge unterbrochen_am + unterbrochen_grund zu termine hinzu...');
  await safeRun(db, `ALTER TABLE termine ADD COLUMN unterbrochen_am DATETIME`);
  await safeRun(db, `ALTER TABLE termine ADD COLUMN unterbrochen_grund TEXT`);
  console.log('✓ Migration 039 abgeschlossen');
}

async function down(db) {
  console.log('✓ Migration 039 rückgängig gemacht (Spalten bleiben erhalten)');
}

module.exports = { migration, up, down };
