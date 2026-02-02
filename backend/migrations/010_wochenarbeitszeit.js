/**
 * Migration 010: Wochenarbeitszeitverwaltung mit Samstag und Abwesenheitssystem
 * 
 * Fügt zu mitarbeiter und lehrlinge hinzu:
 * - wochenarbeitszeit_stunden (REAL DEFAULT 40)
 * - arbeitstage_pro_woche (INTEGER DEFAULT 5)
 * - pausenzeit_minuten (INTEGER DEFAULT 30)
 * - samstag_aktiv (INTEGER DEFAULT 0)
 * - samstag_start (TEXT DEFAULT '09:00')
 * - samstag_ende (TEXT DEFAULT '12:00')
 * - samstag_pausenzeit_minuten (INTEGER DEFAULT 0)
 * 
 * Erstellt neue Tabelle abwesenheiten:
 * - Typen: urlaub, krank, berufsschule, lehrgang
 * - Zuordnung zu mitarbeiter_id ODER lehrling_id
 */

const Database = require('better-sqlite3');
const path = require('path');

function up(db) {
  console.log('Migration 010: Wochenarbeitszeitverwaltung...');

  // 1. Felder zu mitarbeiter hinzufügen
  db.exec(`
    ALTER TABLE mitarbeiter ADD COLUMN wochenarbeitszeit_stunden REAL DEFAULT 40;
  `);
  db.exec(`
    ALTER TABLE mitarbeiter ADD COLUMN arbeitstage_pro_woche INTEGER DEFAULT 5;
  `);
  db.exec(`
    ALTER TABLE mitarbeiter ADD COLUMN pausenzeit_minuten INTEGER DEFAULT 30;
  `);
  db.exec(`
    ALTER TABLE mitarbeiter ADD COLUMN samstag_aktiv INTEGER DEFAULT 0;
  `);
  db.exec(`
    ALTER TABLE mitarbeiter ADD COLUMN samstag_start TEXT DEFAULT '09:00';
  `);
  db.exec(`
    ALTER TABLE mitarbeiter ADD COLUMN samstag_ende TEXT DEFAULT '12:00';
  `);
  db.exec(`
    ALTER TABLE mitarbeiter ADD COLUMN samstag_pausenzeit_minuten INTEGER DEFAULT 0;
  `);

  // 2. Felder zu lehrlinge hinzufügen
  db.exec(`
    ALTER TABLE lehrlinge ADD COLUMN wochenarbeitszeit_stunden REAL DEFAULT 40;
  `);
  db.exec(`
    ALTER TABLE lehrlinge ADD COLUMN arbeitstage_pro_woche INTEGER DEFAULT 5;
  `);
  db.exec(`
    ALTER TABLE lehrlinge ADD COLUMN pausenzeit_minuten INTEGER DEFAULT 30;
  `);
  db.exec(`
    ALTER TABLE lehrlinge ADD COLUMN samstag_aktiv INTEGER DEFAULT 0;
  `);
  db.exec(`
    ALTER TABLE lehrlinge ADD COLUMN samstag_start TEXT DEFAULT '09:00';
  `);
  db.exec(`
    ALTER TABLE lehrlinge ADD COLUMN samstag_ende TEXT DEFAULT '12:00';
  `);
  db.exec(`
    ALTER TABLE lehrlinge ADD COLUMN samstag_pausenzeit_minuten INTEGER DEFAULT 0;
  `);

  // 3. Neue Tabelle: abwesenheiten
  db.exec(`
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
    );
  `);

  // 4. Index für schnelle Abwesenheits-Abfragen
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_abwesenheiten_mitarbeiter ON abwesenheiten(mitarbeiter_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_abwesenheiten_lehrling ON abwesenheiten(lehrling_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_abwesenheiten_datum ON abwesenheiten(datum_von, datum_bis);
  `);

  // 5. Bestehende Mitarbeiter mit Standardwerten initialisieren
  const updateMitarbeiter = db.prepare(`
    UPDATE mitarbeiter 
    SET wochenarbeitszeit_stunden = 40,
        arbeitstage_pro_woche = 5,
        pausenzeit_minuten = 30,
        samstag_aktiv = 0,
        samstag_start = '09:00',
        samstag_ende = '12:00',
        samstag_pausenzeit_minuten = 0
    WHERE wochenarbeitszeit_stunden IS NULL
  `);
  const mitarbeiterUpdated = updateMitarbeiter.run();
  console.log(`  ✓ ${mitarbeiterUpdated.changes} Mitarbeiter mit Standardwerten initialisiert`);

  // 6. Bestehende Lehrlinge mit Standardwerten initialisieren
  const updateLehrlinge = db.prepare(`
    UPDATE lehrlinge 
    SET wochenarbeitszeit_stunden = 40,
        arbeitstage_pro_woche = 5,
        pausenzeit_minuten = 30,
        samstag_aktiv = 0,
        samstag_start = '09:00',
        samstag_ende = '12:00',
        samstag_pausenzeit_minuten = 0
    WHERE wochenarbeitszeit_stunden IS NULL
  `);
  const lehrlingeUpdated = updateLehrlinge.run();
  console.log(`  ✓ ${lehrlingeUpdated.changes} Lehrlinge mit Standardwerten initialisiert`);

  console.log('  ✓ Migration 010 erfolgreich abgeschlossen');
}

function down(db) {
  console.log('Migration 010: Rollback...');
  
  // SQLite unterstützt kein DROP COLUMN, daher müssten Tabellen neu erstellt werden
  // Für Rollback Zwecke dokumentiert:
  console.log('  ⚠️ Rollback nicht unterstützt (SQLite DROP COLUMN Limitierung)');
  console.log('  ℹ️ Manuelle Rollback-Schritte:');
  console.log('     1. DROP TABLE abwesenheiten');
  console.log('     2. Tabellen mitarbeiter und lehrlinge neu erstellen ohne neue Felder');
}

module.exports = { up, down };
