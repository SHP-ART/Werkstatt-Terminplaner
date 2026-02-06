const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'werkstatt.db');
const db = new sqlite3.Database(dbPath);

console.log('=== ANALYSE: Schema-Meta vs Schema-Migrations ===\n');

// 1. Prüfe _schema_meta
db.get(`SELECT sql FROM sqlite_master WHERE name='_schema_meta'`, (err, row) => {
  if (err) {
    console.error('Fehler bei _schema_meta:', err);
  } else if (row) {
    console.log('✓ _schema_meta Struktur:');
    console.log(row.sql);
    console.log();
  } else {
    console.log('✗ _schema_meta existiert nicht');
  }

  // 2. Prüfe schema_migrations
  db.get(`SELECT sql FROM sqlite_master WHERE name='schema_migrations'`, (err, row2) => {
    if (err) {
      console.error('Fehler bei schema_migrations:', err);
    } else if (row2) {
      console.log('✓ schema_migrations Struktur:');
      console.log(row2.sql);
      console.log();
    } else {
      console.log('✗ schema_migrations existiert nicht\n');
    }

    // 3. Zeige _schema_meta Inhalt
    db.all(`SELECT * FROM _schema_meta`, (err, rows) => {
      if (err) {
        console.error('Fehler beim Lesen von _schema_meta:', err);
      } else {
        console.log('=== _SCHEMA_META INHALT ===');
        if (rows && rows.length > 0) {
          console.log(JSON.stringify(rows, null, 2));
        } else {
          console.log('(leer)');
        }
      }

      // 4. Zeige schema_migrations Inhalt (falls vorhanden)
      db.all(`SELECT * FROM schema_migrations`, (err, rows2) => {
        console.log('\n=== SCHEMA_MIGRATIONS INHALT ===');
        if (err) {
          console.log('Tabelle existiert nicht');
        } else if (rows2 && rows2.length > 0) {
          rows2.forEach(r => {
            console.log(`  Version ${r.version}: ${r.applied_at}`);
          });
        } else {
          console.log('(leer)');
        }

        // 5. Prüfe Termine mit verschiedenen Spalten
        console.log('\n=== TERMINE SPALTEN-TEST ===');
        
        // Test startzeit
        db.get(`SELECT COUNT(*) as count FROM termine WHERE startzeit IS NOT NULL`, (err, result) => {
          if (err) {
            console.log('✗ startzeit Spalte: Fehler -', err.message);
          } else {
            console.log(`✓ startzeit Spalte: ${result.count} Einträge`);
          }

          // Test endzeit
          db.get(`SELECT COUNT(*) as count FROM termine WHERE endzeit IS NOT NULL`, (err, result) => {
            if (err) {
              console.log('✗ endzeit Spalte: Fehler -', err.message);
            } else {
              console.log(`✓ endzeit Spalte: ${result.count} Einträge`);
            }

            // Test endzeit_berechnet
            db.get(`SELECT COUNT(*) as count FROM termine WHERE endzeit_berechnet IS NOT NULL`, (err, result) => {
              if (err) {
                console.log('✗ endzeit_berechnet Spalte: Fehler -', err.message);
              } else {
                console.log(`✓ endzeit_berechnet Spalte: ${result.count} Einträge`);
              }

              // Test verschoben_von_datum (Migration 019)
              db.get(`SELECT COUNT(*) as count FROM termine WHERE verschoben_von_datum IS NOT NULL`, (err, result) => {
                console.log('\n=== NEUE MIGRATIONS-SPALTEN ===');
                if (err) {
                  console.log('✗ verschoben_von_datum: NICHT vorhanden (Migration 019 fehlt)');
                } else {
                  console.log(`✓ verschoben_von_datum: Vorhanden (${result.count} Einträge)`);
                }

                // Test pause_tracking Tabelle
                db.get(`SELECT COUNT(*) as count FROM pause_tracking`, (err, result) => {
                  if (err) {
                    console.log('✗ pause_tracking Tabelle: NICHT vorhanden (Migration 019 fehlt)');
                  } else {
                    console.log(`✓ pause_tracking Tabelle: Vorhanden (${result.count} Einträge)`);
                  }

                  // Test tablet_einstellungen Tabelle
                  db.get(`SELECT COUNT(*) as count FROM tablet_einstellungen`, (err, result) => {
                    if (err) {
                      console.log('✗ tablet_einstellungen: NICHT vorhanden (Migration 020 fehlt)');
                    } else {
                      console.log(`✓ tablet_einstellungen: Vorhanden (${result.count} Einträge)`);
                    }

                    console.log('\n=== DIAGNOSE ===');
                    console.log('Die Datenbank scheint ein ALTES Schema zu verwenden!');
                    console.log('- Verwendet _schema_meta statt schema_migrations');
                    console.log('- Neue Migrationen (019, 020) wurden nicht angewendet');
                    console.log('- Backup-Restore überschreibt wahrscheinlich die neue Struktur');
                    console.log('\nLÖSUNG:');
                    console.log('1. Backup der aktuellen DB erstellen');
                    console.log('2. Alte schema_migrations Tabelle erstellen');
                    console.log('3. Migrations manuell nachführen');

                    db.close();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
