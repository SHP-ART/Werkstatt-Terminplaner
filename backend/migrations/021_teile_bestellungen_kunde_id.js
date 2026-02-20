/**
 * Migration 021 - Spalte kunde_id zu teile_bestellungen hinzufügen
 *
 * Ermöglicht Teile-Bestellungen direkt einem Kunden zuzuordnen (ohne Termin).
 * Behebt: SQLITE_ERROR: no such column: tb.kunde_id
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 21,
  description: 'Spalte kunde_id zu teile_bestellungen hinzufügen (Kunden-direkt-Bestellungen)',

  async up(db) {
    // kunde_id hinzufügen (nullable, Bestellung direkt einem Kunden zugewiesen ohne Termin)
    await safeAlterTable(
      db,
      `ALTER TABLE teile_bestellungen ADD COLUMN kunde_id INTEGER REFERENCES kunden(id)`,
      'teile_bestellungen.kunde_id'
    );

    // termin_id darf NULL sein (für Kunden-direkt-Bestellungen)
    // SQLite erlaubt kein ALTER COLUMN, daher nur die neue Spalte anlegen.
    // Die NOT NULL-Constraint auf termin_id bleibt bestehen; Kunden-direkt-
    // Bestellungen werden über termin_id IS NULL + kunde_id IS NOT NULL identifiziert.
    // Um das zu ermöglichen, muss termin_id nullable sein – das geht in SQLite
    // nur über Tabellen-Neuerstellung. Wir verwenden hier einen pragmatischen
    // Ansatz: termin_id bleibt strukturell NOT NULL, aber die Anwendungslogik
    // setzt termin_id = 0 oder NULL je nach SQLite-Version.
    // Stattdessen: termin_id nullable machen via Tabellen-Rebuild.
    await makeTerminIdNullable(db);
  }
};

/**
 * Macht termin_id in teile_bestellungen nullable durch Tabellen-Neubau.
 * Nötig weil SQLite kein ALTER COLUMN unterstützt.
 */
function makeTerminIdNullable(db) {
  return new Promise((resolve, reject) => {
    // Prüfe ob termin_id already nullable ist (PRAGMA liefert notnull=0 dann)
    db.all(`PRAGMA table_info(teile_bestellungen)`, [], (err, cols) => {
      if (err) return reject(err);

      const terminCol = cols.find(c => c.name === 'termin_id');
      if (!terminCol) return resolve(); // Spalte nicht gefunden → nichts tun

      if (terminCol.notnull === 0) {
        // Bereits nullable → nichts zu tun
        return resolve();
      }

      // Tabellen-Rebuild: neue Tabelle ohne NOT NULL auf termin_id
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (e) => { if (e) return reject(e); });

        db.run(`CREATE TABLE teile_bestellungen_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          termin_id INTEGER,
          kunde_id INTEGER REFERENCES kunden(id),
          teil_name TEXT NOT NULL,
          teil_oe_nummer TEXT,
          menge INTEGER DEFAULT 1,
          fuer_arbeit TEXT,
          status TEXT DEFAULT 'offen',
          bestellt_am DATETIME,
          geliefert_am DATETIME,
          notiz TEXT,
          erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
          aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE CASCADE
        )`, (e) => {
          if (e) { db.run('ROLLBACK'); return reject(e); }

          db.run(`INSERT INTO teile_bestellungen_new
            (id, termin_id, kunde_id, teil_name, teil_oe_nummer, menge, fuer_arbeit,
             status, bestellt_am, geliefert_am, notiz, erstellt_am, aktualisiert_am)
            SELECT id, termin_id, kunde_id, teil_name, teil_oe_nummer, menge, fuer_arbeit,
             status, bestellt_am, geliefert_am, notiz, erstellt_am, aktualisiert_am
            FROM teile_bestellungen`, (e) => {
            if (e) { db.run('ROLLBACK'); return reject(e); }

            db.run(`DROP TABLE teile_bestellungen`, (e) => {
              if (e) { db.run('ROLLBACK'); return reject(e); }

              db.run(`ALTER TABLE teile_bestellungen_new RENAME TO teile_bestellungen`, (e) => {
                if (e) { db.run('ROLLBACK'); return reject(e); }

                // Indizes neu erstellen
                db.run(`CREATE INDEX IF NOT EXISTS idx_teile_termin ON teile_bestellungen(termin_id)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_teile_status ON teile_bestellungen(status)`);
                db.run(`CREATE INDEX IF NOT EXISTS idx_teile_kunde ON teile_bestellungen(kunde_id)`);

                db.run('COMMIT', (e) => {
                  if (e) return reject(e);
                  console.log('[Migration 021] teile_bestellungen: termin_id ist jetzt nullable, kunde_id hinzugefügt');
                  resolve();
                });
              });
            });
          });
        });
      });
    });
  });
}
