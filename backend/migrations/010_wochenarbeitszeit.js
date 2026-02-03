/**
 * Migration 010_wochenarbeitszeit: Wochenarbeitszeitverwaltung mit Samstag und Abwesenheitssystem
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
 * 
 * WICHTIG: Migriert automatisch alte abwesenheiten-Tabelle (datum, urlaub, krank)
 *          zu abwesenheiten_legacy und erstellt neue Struktur
 */

const { safeAlterTable, safeCreateTable, safeCreateIndex, safeRun } = require('./helpers');

/**
 * Hilfsfunktion: db.get als Promise
 */
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Hilfsfunktion: db.all als Promise
 */
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

module.exports = {
  version: 12,  // Nach 010_ki_training_quality (10) und 011_ki_external_url (11)
  description: 'Wochenarbeitszeitverwaltung mit Samstag und Abwesenheitssystem',

  async up(db) {
    console.log('Migration: Wochenarbeitszeitverwaltung...');

    // 1. Felder zu mitarbeiter hinzufügen
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN wochenarbeitszeit_stunden REAL DEFAULT 40`,
      'mitarbeiter.wochenarbeitszeit_stunden'
    );
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN arbeitstage_pro_woche INTEGER DEFAULT 5`,
      'mitarbeiter.arbeitstage_pro_woche'
    );
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN pausenzeit_minuten INTEGER DEFAULT 30`,
      'mitarbeiter.pausenzeit_minuten'
    );
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN samstag_aktiv INTEGER DEFAULT 0`,
      'mitarbeiter.samstag_aktiv'
    );
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN samstag_start TEXT DEFAULT '09:00'`,
      'mitarbeiter.samstag_start'
    );
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN samstag_ende TEXT DEFAULT '12:00'`,
      'mitarbeiter.samstag_ende'
    );
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN samstag_pausenzeit_minuten INTEGER DEFAULT 0`,
      'mitarbeiter.samstag_pausenzeit_minuten'
    );

    // 2. Felder zu lehrlinge hinzufügen
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN wochenarbeitszeit_stunden REAL DEFAULT 40`,
      'lehrlinge.wochenarbeitszeit_stunden'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN arbeitstage_pro_woche INTEGER DEFAULT 5`,
      'lehrlinge.arbeitstage_pro_woche'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN pausenzeit_minuten INTEGER DEFAULT 30`,
      'lehrlinge.pausenzeit_minuten'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN samstag_aktiv INTEGER DEFAULT 0`,
      'lehrlinge.samstag_aktiv'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN samstag_start TEXT DEFAULT '09:00'`,
      'lehrlinge.samstag_start'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN samstag_ende TEXT DEFAULT '12:00'`,
      'lehrlinge.samstag_ende'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN samstag_pausenzeit_minuten INTEGER DEFAULT 0`,
      'lehrlinge.samstag_pausenzeit_minuten'
    );

    // 3. Prüfe ob alte abwesenheiten-Tabelle existiert (mit datum, urlaub, krank Struktur)
    console.log('  → Prüfe abwesenheiten-Tabelle...');
    let needsTableMigration = false;
    
    try {
      const tableInfo = await dbAll(db, "PRAGMA table_info(abwesenheiten)");
      
      if (tableInfo && tableInfo.length > 0) {
        // Tabelle existiert - prüfe ob es die alte Struktur ist
        const hasOldStructure = tableInfo.some(c => c.name === 'datum') && 
                                !tableInfo.some(c => c.name === 'mitarbeiter_id');
        
        if (hasOldStructure) {
          console.log('  → Alte abwesenheiten-Struktur erkannt (datum, urlaub, krank)');
          console.log('  → Migriere zu neuem Format...');
          needsTableMigration = true;
          
          // Prüfe ob abwesenheiten_legacy bereits existiert
          const legacyExists = await dbGet(db, 
            "SELECT name FROM sqlite_master WHERE type='table' AND name='abwesenheiten_legacy'"
          );
          
          if (legacyExists) {
            // Legacy existiert bereits, lösche alte abwesenheiten
            console.log('  → abwesenheiten_legacy existiert bereits, lösche alte Tabelle...');
            await safeRun(db, 'DROP TABLE abwesenheiten', 'drop alte abwesenheiten');
          } else {
            // Benenne alte Tabelle um
            await safeRun(db, 
              'ALTER TABLE abwesenheiten RENAME TO abwesenheiten_legacy', 
              'rename abwesenheiten zu legacy'
            );
            console.log('  ✓ Alte Tabelle umbenannt zu abwesenheiten_legacy');
          }
        } else if (tableInfo.some(c => c.name === 'mitarbeiter_id')) {
          console.log('  ✓ abwesenheiten-Tabelle hat bereits neue Struktur');
        }
      }
    } catch (err) {
      // Tabelle existiert nicht - wird neu erstellt
      console.log('  → abwesenheiten-Tabelle existiert nicht, wird erstellt');
    }

    // 4. Neue Tabelle: abwesenheiten (nur wenn nötig)
    await safeCreateTable(db, `
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
    `, 'abwesenheiten');

    if (needsTableMigration) {
      console.log('  ✓ Neue abwesenheiten-Tabelle erstellt');
    }

    // 5. Index für schnelle Abwesenheits-Abfragen
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_abwesenheiten_mitarbeiter ON abwesenheiten(mitarbeiter_id)`,
      'idx_abwesenheiten_mitarbeiter'
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_abwesenheiten_lehrling ON abwesenheiten(lehrling_id)`,
      'idx_abwesenheiten_lehrling'
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_abwesenheiten_datum ON abwesenheiten(datum_von, datum_bis)`,
      'idx_abwesenheiten_datum'
    );

    // 6. Bestehende Mitarbeiter mit Standardwerten initialisieren
    await safeRun(db, `
      UPDATE mitarbeiter 
      SET wochenarbeitszeit_stunden = COALESCE(wochenarbeitszeit_stunden, 40),
          arbeitstage_pro_woche = COALESCE(arbeitstage_pro_woche, 5),
          pausenzeit_minuten = COALESCE(pausenzeit_minuten, 30),
          samstag_aktiv = COALESCE(samstag_aktiv, 0),
          samstag_start = COALESCE(samstag_start, '09:00'),
          samstag_ende = COALESCE(samstag_ende, '12:00'),
          samstag_pausenzeit_minuten = COALESCE(samstag_pausenzeit_minuten, 0)
      WHERE wochenarbeitszeit_stunden IS NULL
    `, 'Mitarbeiter Standardwerte');

    // 7. Bestehende Lehrlinge mit Standardwerten initialisieren
    await safeRun(db, `
      UPDATE lehrlinge 
      SET wochenarbeitszeit_stunden = COALESCE(wochenarbeitszeit_stunden, 40),
          arbeitstage_pro_woche = COALESCE(arbeitstage_pro_woche, 5),
          pausenzeit_minuten = COALESCE(pausenzeit_minuten, 30),
          samstag_aktiv = COALESCE(samstag_aktiv, 0),
          samstag_start = COALESCE(samstag_start, '09:00'),
          samstag_ende = COALESCE(samstag_ende, '12:00'),
          samstag_pausenzeit_minuten = COALESCE(samstag_pausenzeit_minuten, 0)
      WHERE wochenarbeitszeit_stunden IS NULL
    `, 'Lehrlinge Standardwerte');

    console.log('  ✓ Wochenarbeitszeit-Migration erfolgreich abgeschlossen');
  }
};
  }
};
