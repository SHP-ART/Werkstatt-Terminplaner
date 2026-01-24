/**
 * Migration 008: Ersatzautos Sperren
 * Fügt Sperrgrund und Sperrdatum Felder hinzu
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 8,
  description: 'Ersatzautos Sperren (manuell_gesperrt, gesperrt_bis, sperrgrund)',

  async up(db) {
    // Ersatzautos Sperr-Felder
    await safeAlterTable(db,
      `ALTER TABLE ersatzautos ADD COLUMN manuell_gesperrt INTEGER DEFAULT 0`,
      'ersatzautos.manuell_gesperrt'
    );
    await safeAlterTable(db,
      `ALTER TABLE ersatzautos ADD COLUMN gesperrt_bis TEXT`,
      'ersatzautos.gesperrt_bis'
    );
    await safeAlterTable(db,
      `ALTER TABLE ersatzautos ADD COLUMN sperrgrund TEXT`,
      'ersatzautos.sperrgrund'
    );
    await safeAlterTable(db,
      `ALTER TABLE ersatzautos ADD COLUMN gesperrt_seit TEXT`,
      'ersatzautos.gesperrt_seit'
    );
  },

  async down(db) {
    console.log('⚠️ Migration 008 Rollback nicht unterstützt');
  }
};
