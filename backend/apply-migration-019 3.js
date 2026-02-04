#!/usr/bin/env node
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/Users/shp-art/Documents/Github/Werkstatt-Terminplaner/backend/database/werkstatt.db');

async function run() {
  return new Promise((resolve) => {
    db.serialize(() => {
      // pause_tracking Tabelle
      db.run(`
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
      `, err => {
        if (err) console.log('pause_tracking Fehler:', err.message);
        else console.log('✅ pause_tracking Tabelle erstellt/existiert');
      });

      // Indizes
      db.run('CREATE INDEX IF NOT EXISTS idx_pause_tracking_mitarbeiter ON pause_tracking(mitarbeiter_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_pause_tracking_lehrling ON pause_tracking(lehrling_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_pause_tracking_datum ON pause_tracking(datum)');
      db.run('CREATE INDEX IF NOT EXISTS idx_pause_tracking_abgeschlossen ON pause_tracking(abgeschlossen)', () => {
        console.log('✅ Indizes erstellt');
      });

      // verschoben_von_datum in termine - direkt versuchen
      db.run('ALTER TABLE termine ADD COLUMN verschoben_von_datum TEXT NULL', err => {
        if (err && err.message.includes('duplicate column')) {
          console.log('ℹ️ verschoben_von_datum existiert bereits');
        } else if (err) {
          console.log('verschoben_von_datum Fehler:', err.message);
        } else {
          console.log('✅ verschoben_von_datum hinzugefügt');
        }
      });

      // letzter_zugriff_datum in werkstatt_einstellungen
      db.run('ALTER TABLE werkstatt_einstellungen ADD COLUMN letzter_zugriff_datum DATE NULL', err => {
        if (err && err.message.includes('duplicate column')) {
          console.log('ℹ️ letzter_zugriff_datum existiert bereits');
        } else if (err) {
          console.log('letzter_zugriff_datum Fehler:', err.message);
        } else {
          console.log('✅ letzter_zugriff_datum hinzugefügt');
        }
        
        // Schließe Datenbank nach allen Operationen
        setTimeout(() => {
          db.close(() => {
            console.log('\n=== Migration 019 abgeschlossen ===');
            resolve();
          });
        }, 100);
      });
    });
  });
}

run();
