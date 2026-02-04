/**
 * Migration 020: Tablet-Einstellungen
 * 
 * Fügt Tabelle für zentrale Tablet-Steuerung hinzu:
 * - Display Ein-/Ausschaltzeiten
 * - Manueller Display-Status
 * - Tablet-spezifische Konfiguration
 */

const { safeRun } = require('./helpers');

const migration = {
  version: 20,
  description: 'Tablet-Einstellungen für zentrale Display-Steuerung'
};

async function up(db) {
  console.log('Migration 020: Erstelle tablet_einstellungen Tabelle...');

  // Tablet-Einstellungen Tabelle
  await safeRun(db, `
    CREATE TABLE IF NOT EXISTS tablet_einstellungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_ausschaltzeit TEXT DEFAULT '18:10',
      display_einschaltzeit TEXT DEFAULT '07:30',
      manueller_display_status TEXT CHECK(manueller_display_status IN ('auto', 'an', 'aus')) DEFAULT 'auto',
      letztes_update DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Standardwert einfügen falls Tabelle leer
  await safeRun(db, `
    INSERT INTO tablet_einstellungen (id, display_ausschaltzeit, display_einschaltzeit, manueller_display_status)
    SELECT 1, '18:10', '07:30', 'auto'
    WHERE NOT EXISTS (SELECT 1 FROM tablet_einstellungen WHERE id = 1)
  `);

  console.log('✓ tablet_einstellungen Tabelle erstellt');
}

async function down(db) {
  console.log('Migration 020: Entferne tablet_einstellungen Tabelle...');
  await safeRun(db, 'DROP TABLE IF EXISTS tablet_einstellungen');
  console.log('✓ tablet_einstellungen Tabelle entfernt');
}

migration.up = up;
migration.down = down;

module.exports = migration;
