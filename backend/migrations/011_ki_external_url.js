/**
 * Migration 011: Externe KI-URL
 * Speichert manuelle Fallback-URL fuer externe KI
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 11,
  description: 'KI-External URL (ki_external_url)',

  async up(db) {
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN ki_external_url TEXT DEFAULT NULL`,
      'werkstatt_einstellungen.ki_external_url'
    );
  },

  async down(db) {
    console.log('⚠️ Migration 011 Rollback nicht unterstützt');
  }
};
