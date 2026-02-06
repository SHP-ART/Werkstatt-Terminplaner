const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'werkstatt.db');
console.log('Datenbankpfad:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fehler beim Öffnen der Datenbank:', err);
    return;
  }
  console.log('✓ Datenbank geöffnet\n');
});

// 1. Prüfe alle Tabellen
db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, (err, tables) => {
  if (err) {
    console.error('Fehler beim Abrufen der Tabellen:', err);
    return;
  }
  
  console.log('=== TABELLEN ===');
  tables.forEach(t => console.log('  -', t.name));
  console.log();

  // 2. Prüfe Termine-Anzahl
  db.get(`SELECT COUNT(*) as count FROM termine`, (err, result) => {
    if (err) {
      console.error('Fehler beim Zählen der Termine:', err);
    } else {
      console.log('=== TERMINE ===');
      console.log('  Anzahl Termine:', result.count);
    }

    // 3. Prüfe Termine-Struktur
    db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='termine'`, (err, row) => {
      if (err) {
        console.error('Fehler beim Abrufen der Termine-Struktur:', err);
      } else {
        console.log('\n=== TERMINE TABELLEN-STRUKTUR ===');
        console.log(row.sql);
      }

      // 4. Prüfe Fahrzeuge-Anzahl
      db.get(`SELECT COUNT(*) as count FROM fahrzeuge`, (err, result) => {
        if (err) {
          console.error('Fehler beim Zählen der Fahrzeuge:', err);
        } else {
          console.log('\n=== FAHRZEUGE ===');
          console.log('  Anzahl Fahrzeuge:', result.count);
        }

        // 5. Prüfe Mitarbeiter-Anzahl
        db.get(`SELECT COUNT(*) as count FROM mitarbeiter`, (err, result) => {
          if (err) {
            console.error('Fehler beim Zählen der Mitarbeiter:', err);
          } else {
            console.log('\n=== MITARBEITER ===');
            console.log('  Anzahl Mitarbeiter:', result.count);
          }

          // 6. Prüfe Schema-Version
          db.get(`SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 1`, (err, row) => {
            if (err) {
              console.error('Fehler beim Abrufen der Schema-Version:', err);
            } else {
              console.log('\n=== SCHEMA VERSION ===');
              if (row) {
                console.log('  Version:', row.version);
                console.log('  Angewendet am:', row.applied_at);
              } else {
                console.log('  Keine Schema-Version gefunden!');
              }
            }

            // 7. Prüfe ob es Backup-Dateien gibt
            const fs = require('fs');
            const backupDir = path.join(__dirname, 'backups');
            
            console.log('\n=== BACKUPS ===');
            if (fs.existsSync(backupDir)) {
              const backups = fs.readdirSync(backupDir)
                .filter(f => f.endsWith('.db'))
                .sort()
                .reverse()
                .slice(0, 5);
              
              console.log('  Letzte 5 Backups:');
              backups.forEach(b => {
                const stat = fs.statSync(path.join(backupDir, b));
                const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
                console.log(`    - ${b} (${sizeMB} MB)`);
              });
            } else {
              console.log('  Kein Backup-Verzeichnis gefunden');
            }

            // 8. Prüfe letzte 3 Termine (wenn vorhanden)
            db.all(`SELECT id, datum, startzeit, endzeit, kunde_name, fahrzeug_id FROM termine ORDER BY id DESC LIMIT 3`, (err, rows) => {
              console.log('\n=== LETZTE 3 TERMINE ===');
              if (err) {
                console.error('Fehler:', err);
              } else if (rows && rows.length > 0) {
                rows.forEach(t => {
                  console.log(`  ID: ${t.id}, Datum: ${t.datum}, Zeit: ${t.startzeit}-${t.endzeit}, Kunde: ${t.kunde_name}, Fahrzeug: ${t.fahrzeug_id}`);
                });
              } else {
                console.log('  Keine Termine gefunden!');
              }

              db.close((err) => {
                if (err) {
                  console.error('\nFehler beim Schließen der Datenbank:', err);
                } else {
                  console.log('\n✓ Datenbank geschlossen');
                }
              });
            });
          });
        });
      });
    });
  });
});
