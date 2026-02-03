const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = "C:\\test\\Test2\\Werkstatt Terminplaner\\database\\werkstatt.db";

console.log('🔄 Manuelle Migration der Produktiv-Datenbank...');
console.log('📁 Datenbank:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('✗ Fehler beim Öffnen der Datenbank:', err);
    process.exit(1);
  }
});

// Aktuelle Version prüfen
db.get('SELECT version FROM _schema_meta ORDER BY version DESC LIMIT 1', [], (err, row) => {
  if (err) {
    console.error('✗ Fehler beim Lesen der Schema-Version:', err);
    db.close();
    process.exit(1);
  }
  
  const currentVersion = row ? row.version : 0;
  console.log(`📊 Aktuelle Schema-Version: ${currentVersion}`);
  
  // Lade alle Migrationen direkt
  const migrations = [
    require('./migrations/001_initial'),
    require('./migrations/002_termine_basis'),
    require('./migrations/003_ersatzauto'),
    require('./migrations/004_mitarbeiter'),
    require('./migrations/005_lehrlinge'),
    require('./migrations/006_termine_erweitert'),
    require('./migrations/007_ki_einstellungen'),
    require('./migrations/008_ersatzautos_sperren'),
    require('./migrations/009_performance_indizes'),
    require('./migrations/010_ki_training_quality'),
    require('./migrations/011_ki_external_url'),
    require('./migrations/010_wochenarbeitszeit'),  // Version 12
    require('./migrations/012_berechnete_zeiten'),  // Version 13
    require('./migrations/013_create_termine_arbeiten_table'),  // Version 14
    require('./migrations/015_create_arbeitszeiten_plan'),  // Version 15
    require('./migrations/016_add_arbeitszeit_start_ende'),  // Version 16
    require('./migrations/017_create_schicht_templates'),  // Version 17
    require('./migrations/018_cleanup_legacy_tables')  // Version 18
  ];
  
  console.log(`📦 Verfügbare Migrationen: ${migrations.length}`);
  
  // Führe fehlende Migrationen aus
  const pendingMigrations = migrations.filter((m, index) => (index + 1) > currentVersion);
  
  if (pendingMigrations.length === 0) {
    console.log('✅ Keine fehlenden Migrationen!');
    db.close();
    return;
  }
  
  console.log(`📋 Führe ${pendingMigrations.length} Migrationen aus (ab Version ${currentVersion + 1})`);
  
  // Führe Migrationen sequenziell aus
  let index = 0;
  
  function runNext() {
    if (index >= pendingMigrations.length) {
      console.log('\n✅ Alle Migrationen abgeschlossen!');
      db.get('SELECT version FROM _schema_meta ORDER BY version DESC LIMIT 1', [], (err, row) => {
        if (!err && row) {
          console.log(`📊 Neue Schema-Version: ${row.version}`);
        }
        db.close();
      });
      return;
    }
    
    const migration = pendingMigrations[index];
    const version = currentVersion + index + 1;
    console.log(`\n⚙️  Migration ${version}: Wird ausgeführt...`);
    
    try {
      if (!migration || typeof migration.up !== 'function') {
        console.log(`   ⚠️  Keine up() Funktion gefunden für Migration ${version}`);
        index++;
        runNext();
        return;
      }
      
      // Wrapper für synchrone sqlite3-API
      const dbWrapper = {
        prepare: (sql) => {
          return {
            run: (...params) => {
              return new Promise((resolve, reject) => {
                db.run(sql, params, function(err) {
                  if (err) reject(err);
                  else resolve({ lastID: this.lastID, changes: this.changes });
                });
              });
            },
            get: (...params) => {
              return new Promise((resolve, reject) => {
                db.get(sql, params, (err, row) => {
                  if (err) reject(err);
                  else resolve(row);
                });
              });
            },
            all: (...params) => {
              return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });
            }
          };
        },
        exec: (sql) => {
          return new Promise((resolve, reject) => {
            db.exec(sql, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
        run: (sql, ...params) => {
          return new Promise((resolve, reject) => {
            // Flatten params wenn es ein Array ist
            const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            db.run(sql, flatParams, function(err) {
              if (err) reject(err);
              else resolve({ lastID: this.lastID, changes: this.changes });
            });
          });
        },
        get: (sql, ...params) => {
          return new Promise((resolve, reject) => {
            const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            db.get(sql, flatParams, (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });
        },
        all: (sql, ...params) => {
          return new Promise((resolve, reject) => {
            const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
            db.all(sql, flatParams, (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
        }
      };
      
      // Führe Migration aus
      Promise.resolve(migration.up(dbWrapper))
        .then(() => {
          // Speichere Version
          db.run(
            'INSERT OR REPLACE INTO _schema_meta (version, applied_at) VALUES (?, datetime("now"))',
            [version],
            (err) => {
              if (err) {
                console.error(`   ✗ Fehler beim Speichern der Version:`, err.message);
                db.close();
                process.exit(1);
              }
              console.log(`   ✓ Erfolgreich`);
              index++;
              runNext();
            }
          );
        })
        .catch((error) => {
          console.error(`   ✗ Fehler:`, error.message);
          console.error(error.stack);
          db.close();
          process.exit(1);
        });
    } catch (error) {
      console.error(`   ✗ Fehler:`, error.message);
      console.error(error.stack);
      db.close();
      process.exit(1);
    }
  }
  
  runNext();
});
