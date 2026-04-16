const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 32,
  description: 'Stempel-Felder: stempel_start und stempel_ende in termine_arbeiten',

  async up(db) {
    console.log('Migration 032: Füge stempel_start/stempel_ende zu termine_arbeiten hinzu...');
    await safeAlterTable(db,
      'ALTER TABLE termine_arbeiten ADD COLUMN stempel_start TEXT',
      'termine_arbeiten.stempel_start'
    );
    await safeAlterTable(db,
      'ALTER TABLE termine_arbeiten ADD COLUMN stempel_ende TEXT',
      'termine_arbeiten.stempel_ende'
    );
    console.log('✓ Migration 032 abgeschlossen');
  },

  async down(db) {
    console.log('Migration 032: Rollback nicht unterstützt (SQLite DROP COLUMN fehlt)');
  }
};
