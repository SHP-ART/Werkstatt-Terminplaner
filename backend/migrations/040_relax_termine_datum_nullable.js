const { safeRun } = require('./helpers');

module.exports = {
  version: 40,
  description: 'termine.datum NOT NULL entfernen — ermöglicht Split-Termine ohne geplantes Datum (Teil 2)',

  async up(db) {
    console.log('Migration 040: Recreate termine mit datum als nullable...');

    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`ALTER TABLE termine RENAME TO termine_old_040`, (err) => {
          if (err) return reject(err);

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

            const cols = [
              'id', 'termin_nr', 'kunde_id', 'kunde_name', 'kunde_telefon', 'kennzeichen',
              'arbeit', 'umfang', 'geschaetzte_zeit', 'tatsaechliche_zeit', 'datum', 'status',
              'abholung_typ', 'abholung_details', 'abholung_zeit', 'bring_zeit', 'kontakt_option',
              'kilometerstand', 'ersatzauto', 'erstellt_am', 'abholung_datum', 'arbeitszeiten_details',
              'mitarbeiter_id', 'geloescht_am', 'dringlichkeit', 'vin', 'fahrzeugtyp', 'notizen',
              'ersatzauto_tage', 'ersatzauto_bis_datum', 'ersatzauto_bis_zeit', 'ist_schwebend',
              'schwebend_prioritaet', 'parent_termin_id', 'split_teil', 'muss_bearbeitet_werden',
              'erweiterung_von_id', 'ist_erweiterung', 'erweiterung_typ', 'teile_status',
              'interne_auftragsnummer', 'startzeit', 'endzeit_berechnet', 'fertigstellung_zeit',
              'ki_training_exclude', 'ki_training_note', 'verschoben_von_datum', 'nacharbeit_start_zeit',
              'ist_wiederholung', 'lehrling_id', 'unterbrochen_am', 'unterbrochen_grund'
            ];
            const colList = cols.join(', ');
            db.run(`INSERT INTO termine (${colList}) SELECT ${colList} FROM termine_old_040`, (err3) => {
              if (err3) return reject(err3);

              db.run(`DROP TABLE termine_old_040`, (err4) => {
                if (err4) return reject(err4);
                console.log('✓ Migration 040: datum-Spalte ist jetzt nullable, alle Daten übertragen');
                resolve();
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
      db.serialize(() => {
        db.run(`ALTER TABLE termine RENAME TO termine_old_040r`, (err) => {
          if (err) return reject(err);

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

            // Nur Termine mit datum kopieren (NULL-Termine gehen verloren)
            const cols = [
              'id', 'termin_nr', 'kunde_id', 'kunde_name', 'kunde_telefon', 'kennzeichen',
              'arbeit', 'umfang', 'geschaetzte_zeit', 'tatsaechliche_zeit', 'datum', 'status',
              'abholung_typ', 'abholung_details', 'abholung_zeit', 'bring_zeit', 'kontakt_option',
              'kilometerstand', 'ersatzauto', 'erstellt_am', 'abholung_datum', 'arbeitszeiten_details',
              'mitarbeiter_id', 'geloescht_am', 'dringlichkeit', 'vin', 'fahrzeugtyp', 'notizen',
              'ersatzauto_tage', 'ersatzauto_bis_datum', 'ersatzauto_bis_zeit', 'ist_schwebend',
              'schwebend_prioritaet', 'parent_termin_id', 'split_teil', 'muss_bearbeitet_werden',
              'erweiterung_von_id', 'ist_erweiterung', 'erweiterung_typ', 'teile_status',
              'interne_auftragsnummer', 'startzeit', 'endzeit_berechnet', 'fertigstellung_zeit',
              'ki_training_exclude', 'ki_training_note', 'verschoben_von_datum', 'nacharbeit_start_zeit',
              'ist_wiederholung', 'lehrling_id', 'unterbrochen_am', 'unterbrochen_grund'
            ];
            const colList = cols.join(', ');
            db.run(
              `INSERT INTO termine (${colList}) SELECT ${colList} FROM termine_old_040r WHERE datum IS NOT NULL`,
              (err3) => {
                if (err3) return reject(err3);
                db.run(`DROP TABLE termine_old_040r`, (err4) => {
                  if (err4) return reject(err4);
                  resolve();
                });
              }
            );
          });
        });
      });
    });
  }
};
