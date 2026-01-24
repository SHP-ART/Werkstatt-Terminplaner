/**
 * Migration 002: Termine Basis-Erweiterungen
 * Fügt grundlegende Felder zu Terminen und Kunden hinzu
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 2,
  description: 'Termine Basis-Erweiterungen (kunde_name, abholung_*, etc.)',

  async up(db) {
    // Kunden-Felder
    await safeAlterTable(db,
      `ALTER TABLE kunden ADD COLUMN kennzeichen TEXT`,
      'kunden.kennzeichen'
    );
    await safeAlterTable(db,
      `ALTER TABLE kunden ADD COLUMN vin TEXT`,
      'kunden.vin'
    );
    await safeAlterTable(db,
      `ALTER TABLE kunden ADD COLUMN fahrzeugtyp TEXT`,
      'kunden.fahrzeugtyp'
    );

    // Termine Basis-Felder
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN kunde_name TEXT`,
      'termine.kunde_name'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN kunde_telefon TEXT`,
      'termine.kunde_telefon'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN abholung_typ TEXT DEFAULT 'abholung'`,
      'termine.abholung_typ'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN abholung_details TEXT`,
      'termine.abholung_details'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN abholung_zeit TEXT`,
      'termine.abholung_zeit'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN bring_zeit TEXT`,
      'termine.bring_zeit'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN kontakt_option TEXT`,
      'termine.kontakt_option'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN kilometerstand INTEGER`,
      'termine.kilometerstand'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN abholung_datum DATE`,
      'termine.abholung_datum'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN termin_nr TEXT`,
      'termine.termin_nr'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN arbeitszeiten_details TEXT`,
      'termine.arbeitszeiten_details'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN mitarbeiter_id INTEGER`,
      'termine.mitarbeiter_id'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN geloescht_am DATETIME`,
      'termine.geloescht_am'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN dringlichkeit TEXT`,
      'termine.dringlichkeit'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN vin TEXT`,
      'termine.vin'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN fahrzeugtyp TEXT`,
      'termine.fahrzeugtyp'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN notizen TEXT`,
      'termine.notizen'
    );

    // Arbeitszeiten aliase Feld
    await safeAlterTable(db,
      `ALTER TABLE arbeitszeiten ADD COLUMN aliase TEXT DEFAULT ''`,
      'arbeitszeiten.aliase'
    );
  },

  async down(db) {
    // SQLite unterstützt kein DROP COLUMN direkt
    // Für Rollback müsste Tabelle neu erstellt werden
    console.log('⚠️ Migration 002 Rollback nicht unterstützt');
  }
};
