/**
 * Migration 007: KI-Einstellungen
 * Fügt ChatGPT API-Key und KI-Funktionen Felder hinzu
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 7,
  description: 'KI-Einstellungen (ki_mode, smart_scheduling, anomaly_detection)',

  async up(db) {
    // ChatGPT API-Key
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN chatgpt_api_key TEXT DEFAULT NULL`,
      'werkstatt_einstellungen.chatgpt_api_key'
    );

    // KI-Funktionen
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN ki_enabled INTEGER DEFAULT 1`,
      'werkstatt_einstellungen.ki_enabled'
    );
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN realtime_enabled INTEGER DEFAULT 1`,
      'werkstatt_einstellungen.realtime_enabled'
    );
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN ki_mode TEXT DEFAULT 'local'`,
      'werkstatt_einstellungen.ki_mode'
    );
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN smart_scheduling_enabled INTEGER DEFAULT 1`,
      'werkstatt_einstellungen.smart_scheduling_enabled'
    );
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN anomaly_detection_enabled INTEGER DEFAULT 1`,
      'werkstatt_einstellungen.anomaly_detection_enabled'
    );
  },

  async down(db) {
    console.log('⚠️ Migration 007 Rollback nicht unterstützt');
  }
};
