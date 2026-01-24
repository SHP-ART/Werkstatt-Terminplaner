/**
 * Migration 010: KI Training Qualität
 *
 * Fügt Felder für KI-Training-Qualitätskontrolle hinzu:
 * - ki_training_exclude: Termin vom Training ausschließen (0/1)
 * - ki_training_note: Notiz warum ausgeschlossen
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 10,
  description: 'KI Training Qualitätskontrolle',

  async up(db) {
    // Feld zum Ausschließen vom KI-Training
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN ki_training_exclude INTEGER DEFAULT 0`,
      'termine.ki_training_exclude'
    );

    // Notiz-Feld für Ausschluss-Grund
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN ki_training_note TEXT`,
      'termine.ki_training_note'
    );

    console.log('✅ Migration 010: KI Training Qualitätsfelder hinzugefügt');
  },

  async down(db) {
    // SQLite unterstützt kein DROP COLUMN direkt
    console.log('⚠️ Rollback für Migration 010 nicht implementiert (SQLite Limitation)');
  }
};
