const migration = {
  version: 49,
  description: 'Auftragsimporte dateipfad nullable fuer verarbeitete PDFs'
};

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => err ? reject(err) : resolve());
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

async function up(db) {
  console.log('Migration 049: auftragsimporte.dateipfad nullable machen...');

  const table = await get(
    db,
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auftragsimporte'"
  );

  if (!table) {
    console.log('Migration 049: auftragsimporte existiert nicht, uebersprungen');
    return;
  }

  if (!/dateipfad\s+TEXT\s+NOT\s+NULL/i.test(table.sql || '')) {
    console.log('Migration 049: dateipfad ist bereits nullable');
    return;
  }

  await run(db, 'ALTER TABLE auftragsimporte RENAME TO auftragsimporte_old_049');
  await run(db, `
    CREATE TABLE auftragsimporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id INTEGER NULL,
      original_dateiname TEXT NOT NULL,
      dateipfad TEXT,
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
  await run(db, `
    INSERT INTO auftragsimporte
      (id, termin_id, original_dateiname, dateipfad, status, text_extract, erkannte_daten,
       fehler, zuordnungs_treffer, dateigroesse, datei_hash, erstellt_am, verarbeitet_am)
    SELECT id, termin_id, original_dateiname, dateipfad, status, text_extract, erkannte_daten,
           fehler, zuordnungs_treffer, dateigroesse, datei_hash, erstellt_am, verarbeitet_am
      FROM auftragsimporte_old_049
  `);
  await run(db, 'DROP TABLE auftragsimporte_old_049');

  await run(db, 'CREATE INDEX IF NOT EXISTS idx_auftragsimporte_status ON auftragsimporte(status)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_auftragsimporte_hash ON auftragsimporte(datei_hash)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_auftragsimporte_termin ON auftragsimporte(termin_id)');

  console.log('Migration 049 abgeschlossen');
}

async function down() {
  console.log('Migration 049 down: No-Op');
}

migration.up = up;
migration.down = down;

module.exports = migration;
