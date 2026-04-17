const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 33,
  description: 'termine_arbeiten: Person-Constraint entfernen — Stempel ohne Personzuweisung erlaubt',

  async up(db) {
    console.log('Migration 033: Erstelle termine_arbeiten ohne Person-Constraint neu...');

    // SQLite unterstützt kein ALTER TABLE DROP CONSTRAINT
    // → Tabelle umbenennen, neu erstellen, Daten kopieren, alte löschen
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`ALTER TABLE termine_arbeiten RENAME TO termine_arbeiten_old`, err => {
          if (err) return reject(err);

          db.run(`
            CREATE TABLE termine_arbeiten (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              termin_id INTEGER NOT NULL,
              arbeit TEXT NOT NULL,
              zeit INTEGER NOT NULL DEFAULT 0,
              mitarbeiter_id INTEGER,
              lehrling_id INTEGER,
              startzeit TEXT,
              reihenfolge INTEGER DEFAULT 0,
              berechnete_dauer_minuten INTEGER,
              berechnete_endzeit TEXT,
              faktor_nebenzeit REAL,
              faktor_aufgabenbewaeltigung REAL,
              pause_enthalten INTEGER DEFAULT 0,
              pause_minuten INTEGER DEFAULT 0,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              stempel_start TEXT,
              stempel_ende TEXT,
              FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE CASCADE,
              FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE SET NULL,
              FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id) ON DELETE SET NULL
            )
          `, err2 => {
            if (err2) return reject(err2);

            db.run(`
              INSERT INTO termine_arbeiten
                SELECT id, termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id,
                       startzeit, reihenfolge, berechnete_dauer_minuten, berechnete_endzeit,
                       faktor_nebenzeit, faktor_aufgabenbewaeltigung, pause_enthalten,
                       pause_minuten, created_at, updated_at, stempel_start, stempel_ende
                FROM termine_arbeiten_old
            `, err3 => {
              if (err3) return reject(err3);

              db.run(`DROP TABLE termine_arbeiten_old`, err4 => {
                if (err4) return reject(err4);
                console.log('✓ Migration 033: Person-Constraint entfernt, alle Daten übertragen');
                resolve();
              });
            });
          });
        });
      });
    });
  },

  async down(db) {
    console.log('Migration 033: Rollback nicht implementiert');
  }
};
