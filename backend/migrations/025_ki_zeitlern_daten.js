/**
 * Migration 025: KI-Zeitlern-Datenbank
 *
 * Fügt hinzu:
 * - Tabelle ki_zeitlern_daten: Lerndatenpunkte pro Arbeit aus abgeschlossenen Terminen
 *   Jeder Datenpunkt = eine abgeschlossene Arbeit mit geschätzter und tatsächlicher Zeit.
 *   Wird automatisch befüllt wenn ein Termin auf "abgeschlossen" gesetzt wird.
 */

const { safeRun } = require('./helpers');

const migration = {
  version: 25,
  description: 'KI-Zeitlern-Datenbank: ki_zeitlern_daten für Lernkurve und Zeitvorhersage'
};

async function up(db) {
  console.log('Migration 025: Erstelle KI-Zeitlern-Tabelle...');

  await safeRun(db, `
    CREATE TABLE IF NOT EXISTS ki_zeitlern_daten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id INTEGER,
      arbeit TEXT NOT NULL,
      kategorie TEXT,
      geschaetzte_min INTEGER NOT NULL,
      tatsaechliche_min INTEGER NOT NULL,
      abweichung_min INTEGER GENERATED ALWAYS AS (tatsaechliche_min - geschaetzte_min) VIRTUAL,
      abweichung_prozent REAL GENERATED ALWAYS AS (
        CASE WHEN geschaetzte_min > 0
          THEN ROUND((tatsaechliche_min - geschaetzte_min) * 100.0 / geschaetzte_min, 1)
          ELSE NULL
        END
      ) VIRTUAL,
      mitarbeiter_id INTEGER,
      datum DATE NOT NULL,
      exclude INTEGER DEFAULT 0,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_ki_lern_arbeit ON ki_zeitlern_daten(arbeit)`);
  await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_ki_lern_kategorie ON ki_zeitlern_daten(kategorie)`);
  await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_ki_lern_datum ON ki_zeitlern_daten(datum DESC)`);
  await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_ki_lern_termin ON ki_zeitlern_daten(termin_id)`);

  console.log('✓ Migration 025 abgeschlossen');
}

async function down(db) {
  console.log('Migration 025: Rückgängig...');
  await safeRun(db, 'DROP TABLE IF EXISTS ki_zeitlern_daten');
  console.log('✓ Migration 025 rückgängig gemacht');
}

migration.up = up;
migration.down = down;

module.exports = migration;
