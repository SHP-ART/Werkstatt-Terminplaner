const { safeRun } = require('./helpers');

const CREATE_TERMINE = `
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
    lehrling_id INTEGER,
    unterbrochen_am DATETIME,
    unterbrochen_grund TEXT
  )
`;

module.exports = {
  version: 40,
  skipTransaction: true,
  description: 'termine.datum NOT NULL entfernen — ermöglicht Split-Termine ohne geplantes Datum (Teil 2)',

  async up(db) {
    console.log('Migration 040: Recreate termine mit datum als nullable...');

    // PRAGMA foreign_keys = OFF muss ausserhalb einer Transaktion gesetzt werden
    await new Promise((resolve, reject) =>
      db.run('PRAGMA foreign_keys = OFF', (err) => err ? reject(err) : resolve())
    );

    try {
      await new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);

          db.run('ALTER TABLE termine RENAME TO termine_old_040', (err) => {
            if (err) { db.run('ROLLBACK'); return reject(err); }

            // Spalten dynamisch ermitteln — kein hardcodierter Spaltenkatalog
            db.all('PRAGMA table_info(termine_old_040)', [], (pragmaErr, pragmaRows) => {
              if (pragmaErr) { db.run('ROLLBACK'); return reject(pragmaErr); }

              const existingCols = pragmaRows.map(r => r.name);

              db.run(CREATE_TERMINE, [], (err2) => {
                if (err2) { db.run('ROLLBACK'); return reject(err2); }

                const colList = existingCols.join(', ');
                db.run(
                  `INSERT INTO termine (${colList}) SELECT ${colList} FROM termine_old_040`,
                  (err3) => {
                    if (err3) { db.run('ROLLBACK'); return reject(err3); }

                    db.run('DROP TABLE termine_old_040', (err4) => {
                      if (err4) { db.run('ROLLBACK'); return reject(err4); }

                      db.run('COMMIT', (err5) => {
                        if (err5) { db.run('ROLLBACK'); return reject(err5); }
                        console.log('✓ Migration 040: datum-Spalte ist jetzt nullable, alle Daten übertragen');
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
    } finally {
      // FK-Enforcement immer wieder aktivieren (auch bei Fehler)
      await new Promise((resolve) => db.run('PRAGMA foreign_keys = ON', resolve));
    }

    // Indexes wiederherstellen
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_datum ON termine(datum)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_status ON termine(status)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_mitarbeiter_id ON termine(mitarbeiter_id)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_kunde_id ON termine(kunde_id)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_datum_status ON termine(datum, status)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_geloescht_am ON termine(geloescht_am)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_auslastung ON termine(datum, status, mitarbeiter_id)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_schwebend ON termine(ist_schwebend, datum)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_erweiterung ON termine(erweiterung_von_id, ist_erweiterung)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_ersatzauto ON termine(ersatzauto, datum, ersatzauto_bis_datum)');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_wiederholung ON termine(ist_wiederholung, datum) WHERE ist_wiederholung = 1');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_nacharbeit ON termine(datum, muss_bearbeitet_werden) WHERE muss_bearbeitet_werden = 1');
    await safeRun(db, 'CREATE INDEX IF NOT EXISTS idx_termine_geloescht_datum ON termine(geloescht_am, datum)');
  },

  async down(db) {
    console.log('Migration 040: Rollback — datum wieder NOT NULL setzen');

    await new Promise((resolve, reject) =>
      db.run('PRAGMA foreign_keys = OFF', (err) => err ? reject(err) : resolve())
    );

    try {
      await new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);

          db.run('ALTER TABLE termine RENAME TO termine_old_040r', (err) => {
            if (err) { db.run('ROLLBACK'); return reject(err); }

            db.all('PRAGMA table_info(termine_old_040r)', [], (pragmaErr, pragmaRows) => {
              if (pragmaErr) { db.run('ROLLBACK'); return reject(pragmaErr); }

              const existingCols = pragmaRows.map(r => r.name);

              // Neue Tabelle mit datum NOT NULL
              const createNotNull = CREATE_TERMINE.replace('datum DATE,', 'datum DATE NOT NULL,');

              db.run(createNotNull, [], (err2) => {
                if (err2) { db.run('ROLLBACK'); return reject(err2); }

                const colList = existingCols.join(', ');
                db.run(
                  `INSERT INTO termine (${colList}) SELECT ${colList} FROM termine_old_040r WHERE datum IS NOT NULL`,
                  (err3) => {
                    if (err3) { db.run('ROLLBACK'); return reject(err3); }

                    db.run('DROP TABLE termine_old_040r', (err4) => {
                      if (err4) { db.run('ROLLBACK'); return reject(err4); }

                      db.run('COMMIT', (err5) => {
                        if (err5) { db.run('ROLLBACK'); return reject(err5); }
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
    } finally {
      await new Promise((resolve) => db.run('PRAGMA foreign_keys = ON', resolve));
    }
  }
};
