/**
 * Migration 003: Ersatzauto-Felder
 * Fügt Ersatzauto-bezogene Felder zu Terminen hinzu
 */

const { safeAlterTable, safeCreateTable } = require('./helpers');

module.exports = {
  version: 3,
  description: 'Ersatzauto-Felder (ersatzauto_tage, ersatzauto_bis_*, etc.)',

  async up(db) {
    // Ersatzauto-Tabelle erstellen
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS ersatzautos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kennzeichen TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      typ TEXT,
      aktiv INTEGER DEFAULT 1,
      manuell_gesperrt INTEGER DEFAULT 0,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Termine Ersatzauto-Felder
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN ersatzauto INTEGER DEFAULT 0`,
      'termine.ersatzauto'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN ersatzauto_tage INTEGER`,
      'termine.ersatzauto_tage'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN ersatzauto_bis_datum DATE`,
      'termine.ersatzauto_bis_datum'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN ersatzauto_bis_zeit TEXT`,
      'termine.ersatzauto_bis_zeit'
    );

    // Werkstatt-Einstellungen Ersatzauto-Anzahl
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN ersatzauto_anzahl INTEGER DEFAULT 2`,
      'werkstatt_einstellungen.ersatzauto_anzahl'
    );
  },

  async down(db) {
    console.log('⚠️ Migration 003 Rollback nicht unterstützt');
  }
};
