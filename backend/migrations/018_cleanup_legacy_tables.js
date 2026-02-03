/**
 * Migration 018: Cleanup veralteter Tabellen
 * 
 * Entfernt:
 * 1. mitarbeiter_abwesenheiten (ersetzt durch abwesenheiten)
 * 2. abwesenheiten_legacy (alte globale Abwesenheiten)
 * 
 * Migriert vorher alle Daten von mitarbeiter_abwesenheiten → abwesenheiten
 */

const Database = require('better-sqlite3');

function up(db) {
  console.log('Migration 018: Cleanup veralteter Tabellen...');

  // 1. Prüfen, ob mitarbeiter_abwesenheiten existiert und Daten hat
  const checkOldTable = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='mitarbeiter_abwesenheiten'
  `).get();

  if (checkOldTable) {
    // 2. Daten von mitarbeiter_abwesenheiten nach abwesenheiten migrieren
    const oldAbwesenheiten = db.prepare(`
      SELECT * FROM mitarbeiter_abwesenheiten
    `).all();

    if (oldAbwesenheiten.length > 0) {
      console.log(`  → Migriere ${oldAbwesenheiten.length} Einträge von mitarbeiter_abwesenheiten nach abwesenheiten...`);
      
      const insertAbwesenheit = db.prepare(`
        INSERT INTO abwesenheiten (
          mitarbeiter_id, 
          lehrling_id, 
          typ, 
          datum_von, 
          datum_bis, 
          beschreibung,
          erstellt_am
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const abw of oldAbwesenheiten) {
        // Prüfen, ob Eintrag bereits existiert (Duplikat-Check)
        const exists = db.prepare(`
          SELECT COUNT(*) as count FROM abwesenheiten 
          WHERE mitarbeiter_id IS ? 
            AND lehrling_id IS ? 
            AND typ = ? 
            AND datum_von = ? 
            AND datum_bis = ?
        `).get(
          abw.mitarbeiter_id, 
          abw.lehrling_id, 
          abw.typ, 
          abw.von_datum, 
          abw.bis_datum
        );

        if (exists.count === 0) {
          insertAbwesenheit.run(
            abw.mitarbeiter_id,
            abw.lehrling_id,
            abw.typ,
            abw.von_datum,      // von_datum → datum_von
            abw.bis_datum,      // bis_datum → datum_bis
            null,               // beschreibung (nicht in alter Tabelle)
            abw.erstellt_am
          );
        }
      }
      
      console.log(`  ✓ ${oldAbwesenheiten.length} Abwesenheiten migriert`);
    } else {
      console.log('  → Keine Daten in mitarbeiter_abwesenheiten zum Migrieren');
    }

    // 3. Indizes der alten Tabelle entfernen
    db.exec(`DROP INDEX IF EXISTS idx_ma_abw_mitarbeiter`);
    db.exec(`DROP INDEX IF EXISTS idx_ma_abw_lehrling`);
    db.exec(`DROP INDEX IF EXISTS idx_ma_abw_datum`);
    console.log('  ✓ Alte Indizes entfernt');

    // 4. Alte Tabelle mitarbeiter_abwesenheiten löschen
    db.exec(`DROP TABLE IF EXISTS mitarbeiter_abwesenheiten`);
    console.log('  ✓ Tabelle mitarbeiter_abwesenheiten entfernt');
  } else {
    console.log('  → mitarbeiter_abwesenheiten existiert nicht (bereits entfernt)');
  }

  // 5. abwesenheiten_legacy löschen (sollte keine Daten enthalten)
  const checkLegacyTable = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='abwesenheiten_legacy'
  `).get();

  if (checkLegacyTable) {
    const legacyCount = db.prepare(`
      SELECT COUNT(*) as count FROM abwesenheiten_legacy
    `).get();

    if (legacyCount.count > 0) {
      console.log(`  ⚠️  WARNUNG: abwesenheiten_legacy enthält ${legacyCount.count} Einträge`);
      console.log('     Diese werden nicht migriert (globale vs. individuelle Abwesenheiten)');
      console.log('     Tabelle wird als Backup belassen - manuelle Prüfung empfohlen!');
      // Tabelle NICHT löschen, wenn Daten vorhanden sind
    } else {
      db.exec(`DROP TABLE IF EXISTS abwesenheiten_legacy`);
      console.log('  ✓ Tabelle abwesenheiten_legacy entfernt (war leer)');
    }
  } else {
    console.log('  → abwesenheiten_legacy existiert nicht');
  }

  console.log('Migration 018 abgeschlossen ✓');
}

function down(db) {
  console.log('Migration 018 Rollback: Wiederherstellen der alten Tabellen...');

  // Tabelle mitarbeiter_abwesenheiten wiederherstellen
  db.exec(`
    CREATE TABLE IF NOT EXISTS mitarbeiter_abwesenheiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER,
      lehrling_id INTEGER,
      typ TEXT NOT NULL CHECK (typ IN ('urlaub', 'krank')),
      von_datum DATE NOT NULL,
      bis_datum DATE NOT NULL,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id),
      FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id)
    )
  `);

  // Indizes wiederherstellen
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ma_abw_mitarbeiter ON mitarbeiter_abwesenheiten(mitarbeiter_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ma_abw_lehrling ON mitarbeiter_abwesenheiten(lehrling_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ma_abw_datum ON mitarbeiter_abwesenheiten(von_datum, bis_datum)`);

  // Daten zurück migrieren (falls vorhanden)
  const abwesenheiten = db.prepare(`SELECT * FROM abwesenheiten`).all();
  
  if (abwesenheiten.length > 0) {
    const insertOld = db.prepare(`
      INSERT INTO mitarbeiter_abwesenheiten (
        mitarbeiter_id, lehrling_id, typ, von_datum, bis_datum, erstellt_am
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const abw of abwesenheiten) {
      insertOld.run(
        abw.mitarbeiter_id,
        abw.lehrling_id,
        abw.typ,
        abw.datum_von,
        abw.datum_bis,
        abw.erstellt_am
      );
    }
  }

  console.log('Migration 018 Rollback abgeschlossen');
}

module.exports = { up, down };
