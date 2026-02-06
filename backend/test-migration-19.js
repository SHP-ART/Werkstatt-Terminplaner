/**
 * Test-Skript für Migration 019 (Tablet-Einstellungen)
 * 
 * Testet ob die Migration von Schema-Version 18 auf 19 funktioniert
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Test-Datenbank-Pfad
const testDbPath = path.join(__dirname, 'database', 'test-migration-19.db');

console.log('========================================');
console.log('Migration 019 Test');
console.log('========================================\n');

// Schritt 1: Alte Test-Datenbank löschen falls vorhanden
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
  console.log('✓ Alte Test-Datenbank gelöscht\n');
}

// Schritt 2: Neue Test-Datenbank mit Schema Version 18 erstellen
const db = new sqlite3.Database(testDbPath, (err) => {
  if (err) {
    console.error('❌ Fehler beim Erstellen der Test-Datenbank:', err);
    process.exit(1);
  }
  console.log('✓ Test-Datenbank erstellt\n');
});

// Schritt 3: Schema-Meta-Tabelle erstellen und auf Version 18 setzen
db.serialize(() => {
  console.log('Erstelle Schema-Meta-Tabelle und setze Version auf 18...');
  
  db.run(`CREATE TABLE IF NOT EXISTS _schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )`, (err) => {
    if (err) {
      console.error('❌ Fehler beim Erstellen der Meta-Tabelle:', err);
      process.exit(1);
    }
    console.log('✓ _schema_meta Tabelle erstellt');
  });

  db.run(`INSERT INTO _schema_meta (key, value) VALUES ('schema_version', '18')`, (err) => {
    if (err) {
      console.error('❌ Fehler beim Setzen der Schema-Version:', err);
      process.exit(1);
    }
    console.log('✓ Schema-Version auf 18 gesetzt\n');
  });

  // Schritt 4: Einige Beispiel-Tabellen erstellen (simuliere v18 Schema)
  db.run(`CREATE TABLE IF NOT EXISTS termine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_name TEXT,
    datum TEXT,
    uhrzeit TEXT
  )`, (err) => {
    if (err) {
      console.error('❌ Fehler beim Erstellen der Termine-Tabelle:', err);
      process.exit(1);
    }
    console.log('✓ Termine-Tabelle erstellt (Schema v18 simuliert)');
  });

  db.run(`CREATE TABLE IF NOT EXISTS einstellungen (
    id INTEGER PRIMARY KEY,
    werkstatt_name TEXT,
    nebenzeit_prozent REAL DEFAULT 10
  )`, (err) => {
    if (err) {
      console.error('❌ Fehler beim Erstellen der Einstellungen-Tabelle:', err);
      process.exit(1);
    }
    console.log('✓ Einstellungen-Tabelle erstellt (Schema v18 simuliert)');
  });

  // Schritt 5: Prüfe dass tablet_einstellungen NICHT existiert
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='tablet_einstellungen'`, (err, row) => {
    if (err) {
      console.error('❌ Fehler beim Prüfen der Tabellen:', err);
      process.exit(1);
    }
    if (row) {
      console.error('❌ tablet_einstellungen Tabelle existiert bereits vor Migration!');
      process.exit(1);
    }
    console.log('✓ tablet_einstellungen Tabelle existiert noch nicht (wie erwartet)\n');

    // Datenbank schließen
    db.close((err) => {
      if (err) {
        console.error('❌ Fehler beim Schließen der Test-Datenbank:', err);
        process.exit(1);
      }
      console.log('✓ Test-Datenbank vorbereitet und geschlossen\n');

      // Schritt 6: Migration durchführen
      runMigrationTest();
    });
  });
});

// Funktion zum Durchführen der Migration
function runMigrationTest() {
  console.log('========================================');
  console.log('Starte Migration von v18 auf v19...');
  console.log('========================================\n');

  // Setze Umgebungsvariable für Test-DB
  process.env.DB_PATH = testDbPath;

  // Importiere Migrations-System
  const { runMigrations } = require('./migrations');
  
  // Öffne Datenbank erneut für Migration
  const testDb = new sqlite3.Database(testDbPath, async (err) => {
    if (err) {
      console.error('❌ Fehler beim Öffnen der Test-Datenbank für Migration:', err);
      process.exit(1);
    }

    try {
      // Lese aktuelle Version
      testDb.get(`SELECT value FROM _schema_meta WHERE key = 'schema_version'`, async (err, row) => {
        if (err) {
          console.error('❌ Fehler beim Lesen der Schema-Version:', err);
          process.exit(1);
        }

        const currentVersion = parseInt(row.value);
        console.log(`📊 Aktuelle Schema-Version: ${currentVersion}`);

        // Führe Migrationen durch
        console.log('🔄 Führe Migrationen aus...\n');
        const newVersion = await runMigrations(testDb, currentVersion);
        
        console.log(`\n✅ Migration abgeschlossen! Neue Version: ${newVersion}`);

        // Aktualisiere Schema-Version
        testDb.run(
          `UPDATE _schema_meta SET value = ? WHERE key = 'schema_version'`,
          [newVersion.toString()],
          (err) => {
            if (err) {
              console.error('❌ Fehler beim Aktualisieren der Schema-Version:', err);
              process.exit(1);
            }

            // Schritt 7: Verifiziere Migration
            verifyMigration(testDb);
          }
        );
      });
    } catch (error) {
      console.error('❌ Migration fehlgeschlagen:', error);
      process.exit(1);
    }
  });
}

// Funktion zum Verifizieren der Migration
function verifyMigration(testDb) {
  console.log('\n========================================');
  console.log('Verifiziere Migration...');
  console.log('========================================\n');

  // Prüfe 1: tablet_einstellungen Tabelle existiert
  testDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='tablet_einstellungen'`, (err, row) => {
    if (err) {
      console.error('❌ Fehler beim Prüfen der Tabellen:', err);
      process.exit(1);
    }
    if (!row) {
      console.error('❌ tablet_einstellungen Tabelle wurde nicht erstellt!');
      process.exit(1);
    }
    console.log('✅ tablet_einstellungen Tabelle existiert');

    // Prüfe 2: Spalten der Tabelle
    testDb.all(`PRAGMA table_info(tablet_einstellungen)`, (err, columns) => {
      if (err) {
        console.error('❌ Fehler beim Lesen der Tabellen-Info:', err);
        process.exit(1);
      }

      const expectedColumns = ['id', 'display_ausschaltzeit', 'display_einschaltzeit', 'manueller_display_status', 'letztes_update'];
      const actualColumns = columns.map(col => col.name);

      console.log('   Gefundene Spalten:', actualColumns.join(', '));

      const missing = expectedColumns.filter(col => !actualColumns.includes(col));
      if (missing.length > 0) {
        console.error(`❌ Fehlende Spalten: ${missing.join(', ')}`);
        process.exit(1);
      }
      console.log('✅ Alle erwarteten Spalten vorhanden');

      // Prüfe 3: Standardwert wurde eingefügt
      testDb.get(`SELECT * FROM tablet_einstellungen WHERE id = 1`, (err, row) => {
        if (err) {
          console.error('❌ Fehler beim Lesen der Standardwerte:', err);
          process.exit(1);
        }
        if (!row) {
          console.error('❌ Kein Standardwert in tablet_einstellungen gefunden!');
          process.exit(1);
        }

        console.log('✅ Standardwert gefunden:');
        console.log('   - display_einschaltzeit:', row.display_einschaltzeit);
        console.log('   - display_ausschaltzeit:', row.display_ausschaltzeit);
        console.log('   - manueller_display_status:', row.manueller_display_status);

        // Prüfe 4: Schema-Version ist 19
        testDb.get(`SELECT value FROM _schema_meta WHERE key = 'schema_version'`, (err, row) => {
          if (err) {
            console.error('❌ Fehler beim Lesen der finalen Schema-Version:', err);
            process.exit(1);
          }

          const finalVersion = parseInt(row.value);
          if (finalVersion !== 19) {
            console.error(`❌ Schema-Version ist ${finalVersion}, erwartet war 19!`);
            process.exit(1);
          }
          console.log(`✅ Schema-Version korrekt aktualisiert: ${finalVersion}`);

          // Prüfe 5: Alte Tabellen sind noch da
          testDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='termine'`, (err, row) => {
            if (err) {
              console.error('❌ Fehler beim Prüfen der alten Tabellen:', err);
              process.exit(1);
            }
            if (!row) {
              console.error('❌ Termine-Tabelle wurde gelöscht (sollte erhalten bleiben)!');
              process.exit(1);
            }
            console.log('✅ Alte Tabellen sind erhalten geblieben');

            // Schließe Datenbank und beende Test erfolgreich
            testDb.close((err) => {
              if (err) {
                console.error('❌ Fehler beim Schließen der Datenbank:', err);
                process.exit(1);
              }

              console.log('\n========================================');
              console.log('🎉 MIGRATION TEST ERFOLGREICH!');
              console.log('========================================');
              console.log(`\nTest-Datenbank gespeichert unter: ${testDbPath}`);
              console.log('Sie können die Datei manuell überprüfen oder löschen.\n');
              
              process.exit(0);
            });
          });
        });
      });
    });
  });
}
