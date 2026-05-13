const migration = {
  version: 45,
  description: 'Auftragsimporte fuer PDF-Auftragsbestaetigungen'
};

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => err ? reject(err) : resolve());
  });
}

async function up(db) {
  console.log('Migration 045: auftragsimporte Tabelle erstellen...');

  await run(db, `
    CREATE TABLE IF NOT EXISTS auftragsimporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id INTEGER NULL,
      original_dateiname TEXT NOT NULL,
      dateipfad TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'neu',
      text_extract TEXT,
      erkannte_daten TEXT,
      fehler TEXT,
      zuordnungs_treffer TEXT,
      dateigroesse INTEGER,
      datei_hash TEXT,
      erstellt_am TEXT DEFAULT CURRENT_TIMESTAMP,
      verarbeitet_am TEXT,
      FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE SET NULL
    )
  `);

  await run(db, 'CREATE INDEX IF NOT EXISTS idx_auftragsimporte_status ON auftragsimporte(status)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_auftragsimporte_hash ON auftragsimporte(datei_hash)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_auftragsimporte_termin ON auftragsimporte(termin_id)');

  console.log('Migration 045 abgeschlossen');
}

async function down(db) {
  console.log('Migration 045 down: auftragsimporte Tabelle entfernen...');
  await run(db, 'DROP TABLE IF EXISTS auftragsimporte');
}

migration.up = up;
migration.down = down;

module.exports = migration;
