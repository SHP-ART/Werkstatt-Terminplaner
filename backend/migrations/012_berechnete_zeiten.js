/**
 * Migration 012: Berechnete Zeiten pro Arbeit
 * 
 * Fügt zu termine_arbeiten hinzu:
 * - berechnete_dauer_minuten (INTEGER) - Dauer mit Nebenzeit + Aufgabenbewältigung
 * - berechnete_endzeit (TEXT) - Berechnete Endzeit (HH:MM)
 * - faktor_nebenzeit (REAL) - Genutzter Nebenzeit-Prozentsatz (für Historie)
 * - faktor_aufgabenbewaeltigung (REAL) - Genutzter Aufgabenbewältigungs-Prozentsatz
 * - pause_enthalten (INTEGER) - Ob Mittagspause eingerechnet wurde (0/1)
 * - pause_minuten (INTEGER) - Wie viel Pause addiert wurde
 * 
 * Hintergrund: Jede Arbeit wird individuell berechnet basierend auf der zugeordneten Person.
 * Bei Zuordnungsänderung werden die Werte automatisch neu berechnet.
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 12,
  description: 'Berechnete Zeiten pro Arbeit',

  async up(db) {
    console.log('Migration 012: Berechnete Zeiten pro Arbeit...');

    // 1. Felder zu termine_arbeiten hinzufügen
    await safeAlterTable(db,
      `ALTER TABLE termine_arbeiten ADD COLUMN berechnete_dauer_minuten INTEGER DEFAULT NULL`,
      'termine_arbeiten.berechnete_dauer_minuten'
    );
    
    await safeAlterTable(db,
      `ALTER TABLE termine_arbeiten ADD COLUMN berechnete_endzeit TEXT DEFAULT NULL`,
      'termine_arbeiten.berechnete_endzeit'
    );
    
    await safeAlterTable(db,
      `ALTER TABLE termine_arbeiten ADD COLUMN faktor_nebenzeit REAL DEFAULT NULL`,
      'termine_arbeiten.faktor_nebenzeit'
    );
    
    await safeAlterTable(db,
      `ALTER TABLE termine_arbeiten ADD COLUMN faktor_aufgabenbewaeltigung REAL DEFAULT NULL`,
      'termine_arbeiten.faktor_aufgabenbewaeltigung'
    );
    
    await safeAlterTable(db,
      `ALTER TABLE termine_arbeiten ADD COLUMN pause_enthalten INTEGER DEFAULT 0`,
      'termine_arbeiten.pause_enthalten'
    );
    
    await safeAlterTable(db,
      `ALTER TABLE termine_arbeiten ADD COLUMN pause_minuten INTEGER DEFAULT 0`,
      'termine_arbeiten.pause_minuten'
    );

    console.log('  ✓ 6 neue Felder zu termine_arbeiten hinzugefügt');
    console.log('  ✓ Migration 012 erfolgreich abgeschlossen');
  },

  async down(db) {
    console.log('⚠️ Migration 012 Rollback nicht unterstützt (SQLite DROP COLUMN Limitierung)');
  }
};
