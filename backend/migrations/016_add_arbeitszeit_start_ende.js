const path = require('path');
const sqlite3 = require('sqlite3').verbose();

module.exports = {
  version: 16,
  description: 'Fügt arbeitszeit_start und arbeitszeit_ende Felder zur arbeitszeiten_plan Tabelle hinzu',
  
  up: function() {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, '../database/werkstatt.db');
      const db = new sqlite3.Database(dbPath);
      
      console.log('Migration 016: Füge Arbeitszeit Start/Ende Felder hinzu...');

      db.serialize(() => {
        // Prüfe ob Spalten bereits existieren
        db.all('PRAGMA table_info(arbeitszeiten_plan)', (err, columns) => {
          if (err) {
            db.close();
            return reject(err);
          }

          const hasStartTime = columns.some(col => col.name === 'arbeitszeit_start');
          const hasEndTime = columns.some(col => col.name === 'arbeitszeit_ende');

          const addColumns = (callback) => {
            if (!hasStartTime) {
              db.run(`
                ALTER TABLE arbeitszeiten_plan 
                ADD COLUMN arbeitszeit_start TEXT DEFAULT '08:00'
              `, (err) => {
                if (err) return callback(err);
                console.log('  ✓ Spalte arbeitszeit_start hinzugefügt');
                
                if (!hasEndTime) {
                  db.run(`
                    ALTER TABLE arbeitszeiten_plan 
                    ADD COLUMN arbeitszeit_ende TEXT DEFAULT '16:30'
                  `, (err) => {
                    if (err) return callback(err);
                    console.log('  ✓ Spalte arbeitszeit_ende hinzugefügt');
                    callback(null);
                  });
                } else {
                  console.log('  • Spalte arbeitszeit_ende existiert bereits');
                  callback(null);
                }
              });
            } else if (!hasEndTime) {
              db.run(`
                ALTER TABLE arbeitszeiten_plan 
                ADD COLUMN arbeitszeit_ende TEXT DEFAULT '16:30'
              `, (err) => {
                if (err) return callback(err);
                console.log('  ✓ Spalte arbeitszeit_ende hinzugefügt');
                callback(null);
              });
            } else {
              console.log('  • Spalten existieren bereits');
              callback(null);
            }
          };

          addColumns((err) => {
            if (err) {
              db.close();
              return reject(err);
            }

            // Berechne und setze Endzeiten für existierende Einträge
            db.all(`
              SELECT id, arbeitsstunden, pausenzeit_minuten, arbeitszeit_start 
              FROM arbeitszeiten_plan 
              WHERE arbeitszeit_ende IS NULL OR arbeitszeit_ende = '16:30'
            `, (err, entries) => {
              if (err) {
                db.close();
                return reject(err);
              }

              if (entries.length === 0) {
                console.log('  • Keine Einträge zum Aktualisieren');
                db.close();
                console.log('✓ Migration 016 erfolgreich abgeschlossen');
                return resolve();
              }

              let updated = 0;
              const stmt = db.prepare(`
                UPDATE arbeitszeiten_plan 
                SET arbeitszeit_ende = ? 
                WHERE id = ?
              `);

              entries.forEach((entry, index) => {
                // Parse Start-Zeit
                const [startHours, startMinutes] = (entry.arbeitszeit_start || '08:00').split(':').map(Number);
                
                // Berechne Ende-Zeit: Start + Arbeitsstunden + Pause
                const totalMinutes = startMinutes + (entry.arbeitsstunden * 60) + (entry.pausenzeit_minuten || 0);
                const endHours = startHours + Math.floor(totalMinutes / 60);
                const endMinutes = totalMinutes % 60;
                
                const arbeitszeit_ende = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
                
                stmt.run(arbeitszeit_ende, entry.id, (err) => {
                  if (err) {
                    console.error(`  ✗ Fehler bei ID ${entry.id}:`, err);
                  } else {
                    updated++;
                  }

                  if (index === entries.length - 1) {
                    stmt.finalize();
                    console.log(`  ✓ ${updated} Endzeiten berechnet und gesetzt`);
                    db.close();
                    console.log('✓ Migration 016 erfolgreich abgeschlossen');
                    resolve();
                  }
                });
              });
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
      
      console.log('Migration 016 Rollback: Entferne Arbeitszeit Start/Ende Felder...');
      
      // SQLite unterstützt kein DROP COLUMN direkt, aber da es nicht kritisch ist,
      // lassen wir die Spalten einfach (mit NULL-Werten wären sie inaktiv)
      console.log('  • Spalten bleiben erhalten (SQLite Limitation)');
      
      db.close();
      resolve();
    });
  }
};
