/**
 * Migration 006: Termine Erweiterte Felder
 * Fügt schwebend, split und erweiterung Felder hinzu
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 6,
  description: 'Termine Erweiterte Felder (schwebend, split, erweiterung)',

  async up(db) {
    // Schwebende Termine
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN ist_schwebend INTEGER DEFAULT 0`,
      'termine.ist_schwebend'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN schwebend_prioritaet TEXT DEFAULT 'mittel'`,
      'termine.schwebend_prioritaet'
    );

    // Split-Termine
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN parent_termin_id INTEGER`,
      'termine.parent_termin_id'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN split_teil INTEGER`,
      'termine.split_teil'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN muss_bearbeitet_werden INTEGER DEFAULT 0`,
      'termine.muss_bearbeitet_werden'
    );

    // Erweiterungs-Felder
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN erweiterung_von_id INTEGER`,
      'termine.erweiterung_von_id'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN ist_erweiterung INTEGER DEFAULT 0`,
      'termine.ist_erweiterung'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN erweiterung_typ TEXT`,
      'termine.erweiterung_typ'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN teile_status TEXT DEFAULT 'vorraetig'`,
      'termine.teile_status'
    );

    // Interne Auftragsnummer
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN interne_auftragsnummer TEXT`,
      'termine.interne_auftragsnummer'
    );

    // Zeitfelder
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN startzeit TEXT`,
      'termine.startzeit'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN endzeit_berechnet TEXT`,
      'termine.endzeit_berechnet'
    );
    await safeAlterTable(db,
      `ALTER TABLE termine ADD COLUMN fertigstellung_zeit TEXT`,
      'termine.fertigstellung_zeit'
    );
  },

  async down(db) {
    console.log('⚠️ Migration 006 Rollback nicht unterstützt');
  }
};
