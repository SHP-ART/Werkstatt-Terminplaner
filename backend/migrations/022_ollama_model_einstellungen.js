/**
 * Migration 022 - ollama_model zu werkstatt_einstellungen hinzufügen
 *
 * Ermöglicht das Ollama-Modell über die Frontend-Einstellungen zu wechseln,
 * ohne die .env-Datei auf dem Server manuell zu bearbeiten.
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 22,
  description: 'Spalte ollama_model zu werkstatt_einstellungen hinzufügen',

  async up(db) {
    await safeAlterTable(
      db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN ollama_model TEXT DEFAULT NULL`,
      'werkstatt_einstellungen.ollama_model'
    );
  }
};
