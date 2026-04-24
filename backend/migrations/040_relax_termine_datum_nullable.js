const { safeRun } = require('./helpers');

module.exports = {
  version: 40,
  description: 'termine.datum NOT NULL entfernen — ermöglicht Split-Termine ohne geplantes Datum (Teil 2)',

  async up(db) {
    console.log('Migration 040: Recreate termine mit datum als nullable...');

    await new Promise((resolve, reject) => {
      // FK-Enforcement während Table-Recreate deaktivieren (SQLite-Empfehlung)
      db.run('PRAGMA foreign_keys = OFF', (fkErr) => {
        if (fkErr) return reject(fkErr);

      db.run(`ALTER TABLE termine RENAME TO termine_old_040`, (err) => {
        if (err) return reject(err);

        // Spalten der alten Tabelle dynamisch ermitteln — kein hardcodierter Spaltenkatalog
        db.all('PRAGMA table_info(termine_old_040)', [], (pragmaErr, pragmaRows) => {
          if (pragmaErr) return reject(pragmaErr);

          const existingCols = pragmaRows.map(r => r.name);

          db.run(`
            CREATE TABLE termine (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              termin_nr TEXT UNIQUE,
              kunde_id INTEGER,
              kunde_name TEXT,
              kunde_telefon TEXT,
              kennzeichen TEXT NOT NULL,
              arbeit TEXT NOT NULL,
              umfang TEXT,
              geschaetzte_zeit INTEGER NOT NULL,
              tatsaechliche_zeit INTEGER,
              datum DATE,
              status TEXT DEFAULT 'geplant',
              abholung_typ TEXT DEFAULT 'abholung',
              abholung_details TEXT,
              abholung_zeit TEXT,
              bring_zeit TEXT,
              kontakt_option TEXT,
              kilometerstand INTEGER,
              ersatzauto INTEGER DEFAULT 0,
              erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
              abholung_datum DATE,
              arbeitszeiten_details TEXT,
              mitarbeiter_id INTEGER,
              geloescht_am DATETIME,
              dringlichkeit TEXT,
              vin TEXT,
              fahrzeugtyp TEXT,
              notizen TEXT,
              ersatzauto_tage INTEGER,
              ersatzauto_bis_datum DATE,
              ersatzauto_bis_zeit TEXT,
              ist_schwebend INTEGER DEFAULT 0,
              schwebend_prioritaet TEXT DEFAULT 'mittel',
              parent_termin_id INTEGER,
              split_teil INTEGER,
              muss_bearbeitet_werden INTEGER DEFAULT 0,
              erweiterung_von_id INTEGER,
              ist_erweiterung INTEGER DEFAULT 0,
              erweiterung_typ TEXT,
              teile_status TEXT DEFAULT 'vorraetig',
              interne_auftragsnummer TEXT,
              startzeit TEXT,
              endzeit_berechnet TEXT,
              fertigstellung_zeit TEXT,
              ki_training_exclude INTEGER DEFAULT 0,
              ki_training_note TEXT,
              verschoben_von_datum TEXT,
              nacharbeit_start_zeit TEXT,
              ist_wiederholung INTEGER DEFAULT 0,
              lehrling_id INTEGER REFERENCES lehrlinge(id),
              unterbrochen_am DATETIME,
              unterbrochen_grund TEXT,
              FOREIGN KEY (kunde_id) REFERENCES kunden(id)
            )
          `, (err2) => {
            if (err2) return reject(err2);

            // Nur Spalten kopieren die tatsächlich in der alten Tabelle existieren
            const colList = existingCols.join(', ');
            db.run(`INSERT INTO termine (${colList}) SELECT ${colList} FROM termine_old_040`, (err3) => {
              if (err3) return reject(err3);

              db.run(`DROP TABLE termine_old_040`, (err4) => {
                if (err4) return reject(err4);

                db.run('PRAGMA foreign_keys = ON', (fkErr2) => {
                  if (fkErr2) return reject(fkErr2);
                  console.log('✓ Migration 040: datum-Spalte ist jetzt nullable, alle Daten übertragen');
                  resolve();
                });
              });
            });
          });
        });
      });
      });
    });

    // Indexes wiederherstellen
    await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_termine_datum ON termine(datum)`);
    await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_termine_status ON termine(status)`);
    await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_termine_mitarbeiter ON termine(mitarbeiter_id)`);
    await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_termine_kunde ON termine(kunde_id)`);
  },

  async down(db) {
    console.log('Migration 040: Rollback — datum wieder NOT NULL setzen');
    // Alle Termine mit datum=NULL würden verloren gehen — daher nur mit Vorsicht
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = OFF', (fkErr) => {
        if (fkErr) return reject(fkErr);

      db.run(`ALTER TABLE termine RENAME TO termine_old_040r`, (err) => {
        if (err) return reject(err);

        // Spalten der alten Tabelle dynamisch ermitteln
        db.all('PRAGMA table_info(termine_old_040r)', [], (pragmaErr, pragmaRows) => {
          if (pragmaErr) return reject(pragmaErr);

          const existingCols = pragmaRows.map(r => r.name);

          db.run(`
            CREATE TABLE termine (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              termin_nr TEXT UNIQUE,
              kunde_id INTEGER,
              kunde_name TEXT,
              kunde_telefon TEXT,
              kennzeichen TEXT NOT NULL,
              arbeit TEXT NOT NULL,
              umfang TEXT,
              geschaetzte_zeit INTEGER NOT NULL,
              tatsaechliche_zeit INTEGER,
              datum DATE NOT NULL,
              status TEXT DEFAULT 'geplant',
              abholung_typ TEXT DEFAULT 'abholung',
              abholung_details TEXT,
              abholung_zeit TEXT,
              bring_zeit TEXT,
              kontakt_option TEXT,
              kilometerstand INTEGER,
              ersatzauto INTEGER DEFAULT 0,
              erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
              abholung_datum DATE,
              arbeitszeiten_details TEXT,
              mitarbeiter_id INTEGER,
              geloescht_am DATETIME,
              dringlichkeit TEXT,
              vin TEXT,
              fahrzeugtyp TEXT,
              notizen TEXT,
              ersatzauto_tage INTEGER,
              ersatzauto_bis_datum DATE,
              ersatzauto_bis_zeit TEXT,
              ist_schwebend INTEGER DEFAULT 0,
              schwebend_prioritaet TEXT DEFAULT 'mittel',
              parent_termin_id INTEGER,
              split_teil INTEGER,
              muss_bearbeitet_werden INTEGER DEFAULT 0,
              erweiterung_von_id INTEGER,
              ist_erweiterung INTEGER DEFAULT 0,
              erweiterung_typ TEXT,
              teile_status TEXT DEFAULT 'vorraetig',
              interne_auftragsnummer TEXT,
              startzeit TEXT,
              endzeit_berechnet TEXT,
              fertigstellung_zeit TEXT,
              ki_training_exclude INTEGER DEFAULT 0,
              ki_training_note TEXT,
              verschoben_von_datum TEXT,
              nacharbeit_start_zeit TEXT,
              ist_wiederholung INTEGER DEFAULT 0,
              lehrling_id INTEGER REFERENCES lehrlinge(id),
              unterbrochen_am DATETIME,
              unterbrochen_grund TEXT,
              FOREIGN KEY (kunde_id) REFERENCES kunden(id)
            )
          `, (err2) => {
            if (err2) return reject(err2);

            // Nur Spalten kopieren die tatsächlich in der alten Tabelle existieren
            // Termine ohne datum werden weggelassen (waren Split-Platzhalter)
            const colList = existingCols.join(', ');
            db.run(
              `INSERT INTO termine (${colList}) SELECT ${colList} FROM termine_old_040r WHERE datum IS NOT NULL`,
              (err3) => {
                if (err3) return reject(err3);
                db.run(`DROP TABLE termine_old_040r`, (err4) => {
                  if (err4) return reject(err4);
                  db.run('PRAGMA foreign_keys = ON', (fkErr2) => {
                    if (fkErr2) return reject(fkErr2);
                    resolve();
                  });
                });
              }
            );
          });
        });
      });
      });
    });
  }
};
