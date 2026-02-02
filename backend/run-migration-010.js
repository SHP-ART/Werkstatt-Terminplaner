/**
 * Migrations-Runner für Migration 010
 * Verwendet sqlite3 direkt
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'werkstatt.db');

console.log('Öffne Datenbank:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fehler beim Öffnen der Datenbank:', err);
    process.exit(1);
  }
});

// Migration ausführen
console.log('Starte Migration 010: Wochenarbeitszeitverwaltung...\n');

const migrations = [
  // 1. Mitarbeiter-Felder
  'ALTER TABLE mitarbeiter ADD COLUMN wochenarbeitszeit_stunden REAL DEFAULT 40',
  'ALTER TABLE mitarbeiter ADD COLUMN arbeitstage_pro_woche INTEGER DEFAULT 5',
  'ALTER TABLE mitarbeiter ADD COLUMN pausenzeit_minuten INTEGER DEFAULT 30',
  'ALTER TABLE mitarbeiter ADD COLUMN samstag_aktiv INTEGER DEFAULT 0',
  'ALTER TABLE mitarbeiter ADD COLUMN samstag_start TEXT DEFAULT "09:00"',
  'ALTER TABLE mitarbeiter ADD COLUMN samstag_ende TEXT DEFAULT "12:00"',
  'ALTER TABLE mitarbeiter ADD COLUMN samstag_pausenzeit_minuten INTEGER DEFAULT 0',
  
  // 2. Lehrlinge-Felder
  'ALTER TABLE lehrlinge ADD COLUMN wochenarbeitszeit_stunden REAL DEFAULT 40',
  'ALTER TABLE lehrlinge ADD COLUMN arbeitstage_pro_woche INTEGER DEFAULT 5',
  'ALTER TABLE lehrlinge ADD COLUMN pausenzeit_minuten INTEGER DEFAULT 30',
  'ALTER TABLE lehrlinge ADD COLUMN samstag_aktiv INTEGER DEFAULT 0',
  'ALTER TABLE lehrlinge ADD COLUMN samstag_start TEXT DEFAULT "09:00"',
  'ALTER TABLE lehrlinge ADD COLUMN samstag_ende TEXT DEFAULT "12:00"',
  'ALTER TABLE lehrlinge ADD COLUMN samstag_pausenzeit_minuten INTEGER DEFAULT 0',
];

// 3. Alte Abwesenheiten-Tabelle umbenennen und neue erstellen
const renameOldTableSQL = 'ALTER TABLE abwesenheiten RENAME TO abwesenheiten_legacy';

const createTableSQL = `
  CREATE TABLE IF NOT EXISTS abwesenheiten (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_id INTEGER,
    lehrling_id INTEGER,
    typ TEXT NOT NULL CHECK(typ IN ('urlaub', 'krank', 'berufsschule', 'lehrgang')),
    datum_von TEXT NOT NULL,
    datum_bis TEXT NOT NULL,
    beschreibung TEXT,
    erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE CASCADE,
    FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id) ON DELETE CASCADE,
    CHECK ((mitarbeiter_id IS NOT NULL AND lehrling_id IS NULL) OR 
           (mitarbeiter_id IS NULL AND lehrling_id IS NOT NULL))
  )
`;

// Indices
const indices = [
  'CREATE INDEX IF NOT EXISTS idx_abwesenheiten_mitarbeiter ON abwesenheiten(mitarbeiter_id)',
  'CREATE INDEX IF NOT EXISTS idx_abwesenheiten_lehrling ON abwesenheiten(lehrling_id)',
  'CREATE INDEX IF NOT EXISTS idx_abwesenheiten_datum ON abwesenheiten(datum_von, datum_bis)',
];

let completed = 0;
let errors = [];

function runQuery(sql, description) {
  return new Promise((resolve) => {
    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log(`  ⚠️  ${description} - bereits vorhanden`);
        } else if (err.message.includes('already exists')) {
          console.log(`  ⚠️  ${description} - bereits vorhanden`);
        } else {
          console.error(`  ❌ ${description} - Fehler:`, err.message);
          errors.push({ description, error: err.message });
        }
      } else {
        console.log(`  ✓ ${description}`);
      }
      resolve();
    });
  });
}

async function runMigration() {
  // ALTER TABLE Statements
  for (let i = 0; i < migrations.length; i++) {
    const sql = migrations[i];
    const tableName = sql.includes('mitarbeiter') ? 'mitarbeiter' : 'lehrlinge';
    const columnMatch = sql.match(/ADD COLUMN (\w+)/);
    const columnName = columnMatch ? columnMatch[1] : 'Feld';
    await runQuery(sql, `${tableName}.${columnName}`);
  }

  // Alte Tabelle umbenennen
  await runQuery(renameOldTableSQL, 'Alte abwesenheiten -> abwesenheiten_legacy');

  // Neue Tabelle erstellen
  await runQuery(createTableSQL, 'Tabelle abwesenheiten');

  // Indices erstellen
  for (const indexSQL of indices) {
    const indexMatch = indexSQL.match(/idx_(\w+)/);
    const indexName = indexMatch ? indexMatch[1] : 'Index';
    await runQuery(indexSQL, `Index ${indexName}`);
  }

  // Update bestehende Mitarbeiter
  console.log('\n  Initialisiere bestehende Mitarbeiter...');
  db.run(`
    UPDATE mitarbeiter 
    SET wochenarbeitszeit_stunden = 40,
        arbeitstage_pro_woche = 5,
        pausenzeit_minuten = 30,
        samstag_aktiv = 0,
        samstag_start = '09:00',
        samstag_ende = '12:00',
        samstag_pausenzeit_minuten = 0
    WHERE wochenarbeitszeit_stunden IS NULL
  `, function(err) {
    if (err) {
      console.error('  ❌ Fehler beim Update:', err.message);
    } else {
      console.log(`  ✓ ${this.changes} Mitarbeiter aktualisiert`);
    }

    // Update bestehende Lehrlinge
    console.log('\n  Initialisiere bestehende Lehrlinge...');
    db.run(`
      UPDATE lehrlinge 
      SET wochenarbeitszeit_stunden = 40,
          arbeitstage_pro_woche = 5,
          pausenzeit_minuten = 30,
          samstag_aktiv = 0,
          samstag_start = '09:00',
          samstag_ende = '12:00',
          samstag_pausenzeit_minuten = 0
      WHERE wochenarbeitszeit_stunden IS NULL
    `, function(err) {
      if (err) {
        console.error('  ❌ Fehler beim Update:', err.message);
      } else {
        console.log(`  ✓ ${this.changes} Lehrlinge aktualisiert`);
      }

      // Abschluss
      console.log('\n' + '='.repeat(50));
      if (errors.length > 0) {
        console.log('⚠️  Migration mit Warnungen abgeschlossen');
        console.log('Fehler:', errors.length);
      } else {
        console.log('✅ Migration 010 erfolgreich abgeschlossen!');
      }
      console.log('='.repeat(50) + '\n');

      db.close((err) => {
        if (err) {
          console.error('Fehler beim Schließen:', err);
        }
        process.exit(errors.length > 0 ? 1 : 0);
      });
    });
  });
}

runMigration().catch((err) => {
  console.error('Fataler Fehler:', err);
  db.close();
  process.exit(1);
});
