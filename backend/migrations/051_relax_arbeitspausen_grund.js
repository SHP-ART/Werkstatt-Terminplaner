/**
 * Migration 051: Arbeitspausen-Grund "sonstiges" erlauben
 */

const { runSQL } = require('./helpers');

module.exports = {
  version: 51,
  description: 'Arbeitspausen: Pausengrund sonstiges erlauben',

  async up(db) {
    console.log('Migration 051: Erweitere arbeitspausen.grund um sonstiges...');

    await runSQL(db, `ALTER TABLE arbeitspausen RENAME TO arbeitspausen_old_051`);
    await runSQL(db, `
      CREATE TABLE arbeitspausen (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        termin_id      INTEGER NOT NULL,
        mitarbeiter_id INTEGER,
        lehrling_id    INTEGER,
        grund          TEXT NOT NULL CHECK(grund IN ('teil_fehlt', 'rueckfrage_kunde', 'vorrang', 'sonstiges')),
        gestartet_am   DATETIME NOT NULL,
        beendet_am     DATETIME,
        FOREIGN KEY (termin_id) REFERENCES termine(id)
      )
    `);
    await runSQL(db, `
      INSERT INTO arbeitspausen (id, termin_id, mitarbeiter_id, lehrling_id, grund, gestartet_am, beendet_am)
      SELECT id, termin_id, mitarbeiter_id, lehrling_id, grund, gestartet_am, beendet_am
        FROM arbeitspausen_old_051
    `);
    await runSQL(db, `DROP TABLE arbeitspausen_old_051`);
    await runSQL(db, `
      CREATE INDEX IF NOT EXISTS idx_arbeitspausen_termin
      ON arbeitspausen(termin_id)
    `);
    await runSQL(db, `
      CREATE INDEX IF NOT EXISTS idx_arbeitspausen_aktiv
      ON arbeitspausen(beendet_am)
      WHERE beendet_am IS NULL
    `);

    console.log('Migration 051 abgeschlossen');
  },

  async down(db) {
    console.log('Migration 051: Rollback nicht implementiert');
  }
};
