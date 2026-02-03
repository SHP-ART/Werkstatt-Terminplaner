/**
 * Migration 019: Pause-Tracking und Termin-Verschiebung
 * 
 * Hinzugefügt:
 * 1. pause_tracking Tabelle - Pausenzeit-Verwaltung mit Historie
 * 2. termine.verschoben_von_datum - Flag für verschobene Termine
 * 3. werkstatt_einstellungen.letzter_zugriff_datum - Für tägliches Reset
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
  version: 19,
  description: 'Pause-Tracking und Termin-Verschiebung',

  async up(db) {
    console.log('Migration 019: Pause-Tracking und Termin-Verschiebung...');

    // 1. Erstelle pause_tracking Tabelle
    await safeRun(db, `
      CREATE TABLE IF NOT EXISTS pause_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mitarbeiter_id INTEGER NULL,
        lehrling_id INTEGER NULL,
        pause_start_zeit TEXT NOT NULL,
        pause_ende_zeit TEXT NULL,
        pause_naechster_termin_id INTEGER NULL,
        datum DATE NOT NULL,
        abgeschlossen INTEGER DEFAULT 0,
        erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE CASCADE,
        FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id) ON DELETE CASCADE,
        FOREIGN KEY (pause_naechster_termin_id) REFERENCES termine(id) ON DELETE SET NULL
      )
    `);
    console.log('  ✓ Tabelle pause_tracking erstellt');

    // 2. Erstelle Indizes für pause_tracking
    await safeCreateIndex(db, 'idx_pause_tracking_mitarbeiter', 'pause_tracking', 'mitarbeiter_id');
    await safeCreateIndex(db, 'idx_pause_tracking_lehrling', 'pause_tracking', 'lehrling_id');
    await safeCreateIndex(db, 'idx_pause_tracking_datum', 'pause_tracking', 'datum');
    await safeCreateIndex(db, 'idx_pause_tracking_abgeschlossen', 'pause_tracking', 'abgeschlossen');
    console.log('  ✓ Indizes für pause_tracking erstellt');

    // 3. Prüfe ob verschoben_von_datum bereits existiert
    const checkVerschoben = await dbGet(db, `
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='termine'
    `);

    if (checkVerschoben && checkVerschoben.sql && !checkVerschoben.sql.includes('verschoben_von_datum')) {
      await safeRun(db, `
        ALTER TABLE termine ADD COLUMN verschoben_von_datum TEXT NULL
      `);
      console.log('  ✓ Spalte termine.verschoben_von_datum hinzugefügt');
    } else {
      console.log('  ℹ Spalte termine.verschoben_von_datum existiert bereits');
    }

    // 4. Prüfe ob letzter_zugriff_datum bereits existiert
    const checkLetzterZugriff = await dbGet(db, `
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='werkstatt_einstellungen'
    `);

    if (checkLetzterZugriff && checkLetzterZugriff.sql && !checkLetzterZugriff.sql.includes('letzter_zugriff_datum')) {
      await safeRun(db, `
        ALTER TABLE werkstatt_einstellungen ADD COLUMN letzter_zugriff_datum DATE NULL
      `);
      console.log('  ✓ Spalte werkstatt_einstellungen.letzter_zugriff_datum hinzugefügt');
    } else {
      console.log('  ℹ Spalte werkstatt_einstellungen.letzter_zugriff_datum existiert bereits');
    }

    console.log('Migration 019 abgeschlossen ✓');
  },

  async down(db) {
    console.log('Rollback Migration 019...');

    // Entferne Tabelle pause_tracking
    await safeRun(db, `DROP TABLE IF EXISTS pause_tracking`);
    console.log('  ✓ Tabelle pause_tracking entfernt');

    // Entferne Spalten (SQLite unterstützt kein ALTER TABLE DROP COLUMN direkt)
    // Workaround: Tabellen neu erstellen ohne die Spalten
    console.log('  ⚠ Spalten-Entfernung in SQLite nur über Tabellen-Neuerstelle möglich');
    console.log('  ℹ verschoben_von_datum und letzter_zugriff_datum bleiben bestehen');

    console.log('Rollback Migration 019 abgeschlossen');
  }
};
