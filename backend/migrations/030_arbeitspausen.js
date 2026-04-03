/**
 * Migration 030: Arbeitspausen-Tabelle
 *
 * Fügt hinzu:
 * - Tabelle `arbeitspausen`: Speichert manuelle Arbeitsunterbrechungen
 *   - id: Primärschlüssel
 *   - termin_id: Referenz zum Termin (NOT NULL)
 *   - mitarbeiter_id: Zuständiger Mitarbeiter (optional)
 *   - lehrling_id: Zuständiger Lehrling (optional)
 *   - grund: Grund der Arbeitsunterbrechung (Text)
 *   - gestartet_am: Zeitstempel Pausenstart
 *   - beendet_am: Zeitstempel Pausenende (NULL = noch aktiv)
 * - Index auf termin_id für schnelle Abfragen
 * - Filterindex auf beendet_am IS NULL für aktive Pausen
 */

const { safeRun } = require('./helpers');

const migration = {
  version: 30,
  description: 'Arbeitspausen: Tabelle arbeitspausen für manuelle Arbeitsunterbrechungen'
};

async function up(db) {
  console.log('Migration 030: Erstelle arbeitspausen-Tabelle...');

  await safeRun(db, `
    CREATE TABLE IF NOT EXISTS arbeitspausen (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id      INTEGER NOT NULL,
      mitarbeiter_id INTEGER,
      lehrling_id    INTEGER,
      grund          TEXT NOT NULL CHECK(grund IN ('teil_fehlt', 'rueckfrage_kunde', 'vorrang')),
      gestartet_am   DATETIME NOT NULL,
      beendet_am     DATETIME,
      FOREIGN KEY (termin_id) REFERENCES termine(id)
    )
  `);

  await safeRun(db, `
    CREATE INDEX IF NOT EXISTS idx_arbeitspausen_termin
    ON arbeitspausen(termin_id)
  `);

  await safeRun(db, `
    CREATE INDEX IF NOT EXISTS idx_arbeitspausen_aktiv
    ON arbeitspausen(beendet_am)
    WHERE beendet_am IS NULL
  `);

  console.log('✓ Migration 030 abgeschlossen');
}

async function down(db) {
  await safeRun(db, 'DROP INDEX IF EXISTS idx_arbeitspausen_aktiv');
  await safeRun(db, 'DROP INDEX IF EXISTS idx_arbeitspausen_termin');
  await safeRun(db, 'DROP TABLE IF EXISTS arbeitspausen');
  console.log('✓ Migration 030 rückgängig gemacht');
}

migration.up = up;
migration.down = down;

module.exports = migration;
