const { safeRun } = require('./helpers');

const migration = {
  version: 36,
  description: 'Tagesstempel: nachgefragt_am + kommen_zeit nullable für Nachstempel-Feature'
};

async function up(db) {
  console.log('Migration 036: Füge nachgefragt_am hinzu + kommen_zeit nullable...');

  // 1. Neue Spalte hinzufügen (idempotent: safeRun ignoriert duplicate column)
  await safeRun(db, `ALTER TABLE tagesstempel ADD COLUMN nachgefragt_am TEXT DEFAULT NULL`);

  // 2. kommen_zeit auf nullable umstellen (SQLite: neue Tabelle + Copy + Rename)
  // Idempotenz: nur wenn kommen_zeit aktuell NOT NULL ist
  const tableInfo = await new Promise((resolve) => {
    db.all(`PRAGMA table_info(tagesstempel)`, (err, rows) => resolve(rows || []));
  });
  const kommenSpalte = tableInfo.find(c => c.name === 'kommen_zeit');
  if (kommenSpalte && kommenSpalte.notnull === 1) {
    await safeRun(db, `
      CREATE TABLE tagesstempel_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        mitarbeiter_id INTEGER REFERENCES mitarbeiter(id) ON DELETE SET NULL,
        lehrling_id    INTEGER REFERENCES lehrlinge(id)   ON DELETE SET NULL,
        datum          TEXT NOT NULL,
        kommen_zeit    TEXT,
        gehen_zeit     TEXT,
        kommen_quelle  TEXT,
        gehen_quelle   TEXT,
        nachgefragt_am TEXT DEFAULT NULL,
        erstellt_am    TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL)
      )
    `);
    await safeRun(db, `
      INSERT INTO tagesstempel_new (id, mitarbeiter_id, lehrling_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am, erstellt_am)
      SELECT id, mitarbeiter_id, lehrling_id, datum, kommen_zeit, gehen_zeit, kommen_quelle, gehen_quelle, nachgefragt_am, erstellt_am
      FROM tagesstempel
    `);
    await safeRun(db, `DROP TABLE tagesstempel`);
    await safeRun(db, `ALTER TABLE tagesstempel_new RENAME TO tagesstempel`);
    await safeRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_tagesstempel_ma_datum ON tagesstempel(mitarbeiter_id, datum) WHERE mitarbeiter_id IS NOT NULL`);
    await safeRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_tagesstempel_ll_datum ON tagesstempel(lehrling_id, datum) WHERE lehrling_id IS NOT NULL`);
  }

  // 3. Bestand initialisieren (nur NULL-Werte)
  await safeRun(db, `UPDATE tagesstempel SET nachgefragt_am = erstellt_am WHERE nachgefragt_am IS NULL`);

  console.log('Migration 036 abgeschlossen');
}

async function down(db) {
  // SQLite unterstützt kein DROP COLUMN vor 3.35 — Spalte bleibt bestehen
  console.log('Migration 036 rückgängig (nachgefragt_am bleibt, kommen_zeit bleibt nullable)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
