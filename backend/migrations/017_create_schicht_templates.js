const path = require('path');
const sqlite3 = require('sqlite3').verbose();

module.exports = {
  version: 17,
  description: 'Erstellt schicht_templates Tabelle für wiederverwendbare Schichtvorlagen',
  
  up: function() {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, '../database/werkstatt.db');
      const db = new sqlite3.Database(dbPath);
      
      console.log('Migration 017: Erstelle Schicht-Templates Tabelle...');

      db.serialize(() => {
        // 1. Tabelle für Schicht-Templates erstellen
        db.run(`
          CREATE TABLE IF NOT EXISTS schicht_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            beschreibung TEXT,
            arbeitszeit_start TEXT NOT NULL,
            arbeitszeit_ende TEXT NOT NULL,
            farbe TEXT DEFAULT '#667eea',
            sortierung INTEGER DEFAULT 0,
            aktiv INTEGER DEFAULT 1,
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            console.error('  ✗ Fehler beim Erstellen der Tabelle:', err);
            db.close();
            return reject(err);
          }
          console.log('  ✓ Tabelle schicht_templates erstellt');

          // 2. Standard-Schichten einfügen
          const defaultSchichten = [
            { name: 'Frühschicht', beschreibung: 'Standard Frühschicht', start: '06:00', ende: '14:30', farbe: '#fbbf24', sortierung: 1 },
            { name: 'Normalschicht', beschreibung: 'Standard Arbeitszeit', start: '08:00', ende: '16:30', farbe: '#10b981', sortierung: 2 },
            { name: 'Spätschicht', beschreibung: 'Standard Spätschicht', start: '14:00', ende: '22:30', farbe: '#f59e0b', sortierung: 3 },
            { name: 'Kurzschicht', beschreibung: 'Halbtags 4 Stunden', start: '08:00', ende: '12:30', farbe: '#6366f1', sortierung: 4 }
          ];

          // Prüfe ob bereits Schichten existieren
          db.get('SELECT COUNT(*) as count FROM schicht_templates', (err, row) => {
            if (err) {
              console.error('  ✗ Fehler beim Prüfen:', err);
              db.close();
              return reject(err);
            }

            if (row.count > 0) {
              console.log('  • Schicht-Templates existieren bereits');
              db.close();
              console.log('✓ Migration 017 erfolgreich abgeschlossen');
              return resolve();
            }

            const stmt = db.prepare(`
              INSERT INTO schicht_templates (name, beschreibung, arbeitszeit_start, arbeitszeit_ende, farbe, sortierung)
              VALUES (?, ?, ?, ?, ?, ?)
            `);

            let inserted = 0;
            defaultSchichten.forEach((schicht, index) => {
              stmt.run(
                schicht.name,
                schicht.beschreibung,
                schicht.start,
                schicht.ende,
                schicht.farbe,
                schicht.sortierung,
                (err) => {
                  if (err) {
                    console.error(`  ✗ Fehler bei ${schicht.name}:`, err);
                  } else {
                    inserted++;
                  }

                  if (index === defaultSchichten.length - 1) {
                    stmt.finalize();
                    console.log(`  ✓ ${inserted} Standard-Schichten eingefügt`);
                    db.close();
                    console.log('✓ Migration 017 erfolgreich abgeschlossen');
                    resolve();
                  }
                }
              );
            });
          });
        });
      });
    });
  },

  down: function() {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, '../database/werkstatt.db');
      const db = new sqlite3.Database(dbPath);
      
      console.log('Migration 017 Rollback: Entferne schicht_templates Tabelle...');
      
      db.run('DROP TABLE IF EXISTS schicht_templates', (err) => {
        if (err) {
          console.error('  ✗ Fehler:', err);
          db.close();
          return reject(err);
        }
        console.log('  ✓ Tabelle schicht_templates entfernt');
        db.close();
        resolve();
      });
    });
  }
};
