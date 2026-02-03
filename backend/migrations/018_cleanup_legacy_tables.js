/**
 * Migration 018: Cleanup veralteter Tabellen
 * 
 * Entfernt:
 * 1. mitarbeiter_abwesenheiten (ersetzt durch abwesenheiten)
 * 2. abwesenheiten_legacy (alte globale Abwesenheiten)
 * 
 * Migriert vorher alle Daten von mitarbeiter_abwesenheiten → abwesenheiten
 */

const { safeRun, safeCreateIndex } = require('./helpers');

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

/**
 * Hilfsfunktion: db.run als Promise
 */
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

module.exports = {
  version: 18,
  description: 'Cleanup veralteter Tabellen',

  async up(db) {
    console.log('Migration 018: Cleanup veralteter Tabellen...');

    // 1. Prüfen, ob mitarbeiter_abwesenheiten existiert und Daten hat
    const checkOldTable = await dbGet(db, `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='mitarbeiter_abwesenheiten'
    `);

    if (checkOldTable) {
      // 2. Daten von mitarbeiter_abwesenheiten nach abwesenheiten migrieren
      const oldAbwesenheiten = await dbAll(db, `
        SELECT * FROM mitarbeiter_abwesenheiten
      `);

      if (oldAbwesenheiten.length > 0) {
        console.log(`  → Migriere ${oldAbwesenheiten.length} Einträge von mitarbeiter_abwesenheiten nach abwesenheiten...`);
        
        for (const abw of oldAbwesenheiten) {
          // Prüfen, ob Eintrag bereits existiert (Duplikat-Check)
          const exists = await dbGet(db, `
            SELECT COUNT(*) as count FROM abwesenheiten 
            WHERE mitarbeiter_id IS ? 
              AND lehrling_id IS ? 
              AND typ = ? 
              AND datum_von = ? 
              AND datum_bis = ?
          `, [
            abw.mitarbeiter_id, 
            abw.lehrling_id, 
            abw.typ, 
            abw.von_datum, 
            abw.bis_datum
          ]);

          if (!exists || exists.count === 0) {
            await dbRun(db, `
              INSERT INTO abwesenheiten (
                mitarbeiter_id, 
                lehrling_id, 
                typ, 
                datum_von, 
                datum_bis, 
                beschreibung,
                erstellt_am
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
              abw.mitarbeiter_id,
              abw.lehrling_id,
              abw.typ,
              abw.von_datum,      // von_datum → datum_von
              abw.bis_datum,      // bis_datum → datum_bis
              null,               // beschreibung (nicht in alter Tabelle)
              abw.erstellt_am
            ]);
          }
        }
        
        console.log(`  ✓ ${oldAbwesenheiten.length} Abwesenheiten migriert`);
      } else {
        console.log('  → Keine Daten in mitarbeiter_abwesenheiten zum Migrieren');
      }

      // 3. Indizes der alten Tabelle entfernen
      await safeRun(db, `DROP INDEX IF EXISTS idx_ma_abw_mitarbeiter`, 'drop idx_ma_abw_mitarbeiter');
      await safeRun(db, `DROP INDEX IF EXISTS idx_ma_abw_lehrling`, 'drop idx_ma_abw_lehrling');
      await safeRun(db, `DROP INDEX IF EXISTS idx_ma_abw_datum`, 'drop idx_ma_abw_datum');
      console.log('  ✓ Alte Indizes entfernt');

      // 4. Alte Tabelle mitarbeiter_abwesenheiten löschen
      await safeRun(db, `DROP TABLE IF EXISTS mitarbeiter_abwesenheiten`, 'drop mitarbeiter_abwesenheiten');
      console.log('  ✓ Tabelle mitarbeiter_abwesenheiten entfernt');
    } else {
      console.log('  → mitarbeiter_abwesenheiten existiert nicht (bereits entfernt)');
    }

    // 5. abwesenheiten_legacy löschen (sollte keine Daten enthalten)
    const checkLegacyTable = await dbGet(db, `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='abwesenheiten_legacy'
    `);

    if (checkLegacyTable) {
      const legacyCount = await dbGet(db, `
        SELECT COUNT(*) as count FROM abwesenheiten_legacy
      `);

      if (legacyCount && legacyCount.count > 0) {
        console.log(`  ⚠️  WARNUNG: abwesenheiten_legacy enthält ${legacyCount.count} Einträge`);
        console.log('     Diese werden nicht migriert (globale vs. individuelle Abwesenheiten)');
        console.log('     Tabelle wird als Backup belassen - manuelle Prüfung empfohlen!');
        // Tabelle NICHT löschen, wenn Daten vorhanden sind
      } else {
        await safeRun(db, `DROP TABLE IF EXISTS abwesenheiten_legacy`, 'drop abwesenheiten_legacy');
        console.log('  ✓ Tabelle abwesenheiten_legacy entfernt (war leer)');
      }
    } else {
      console.log('  → abwesenheiten_legacy existiert nicht');
    }

    console.log('Migration 018 abgeschlossen ✓');
  }
};
