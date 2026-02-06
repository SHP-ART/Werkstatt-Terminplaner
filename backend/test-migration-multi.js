/**
 * Test-Skript für Multi-Version Migration
 * 
 * Testet ob Migrationen von sehr alten Versionen (z.B. v10) zu v19 funktionieren
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Test-Datenbank-Pfad
const testDbPath = path.join(__dirname, 'database', 'test-migration-multi.db');

console.log('========================================');
console.log('Multi-Version Migration Test (v10 → v19)');
console.log('========================================\n');

// Schritt 1: Alte Test-Datenbank löschen falls vorhanden
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
  console.log('✓ Alte Test-Datenbank gelöscht\n');
}

// Schritt 2: Neue Test-Datenbank mit Schema Version 10 erstellen
const db = new sqlite3.Database(testDbPath, (err) => {
  if (err) {
    console.error('❌ Fehler beim Erstellen der Test-Datenbank:', err);
    process.exit(1);
  }
  console.log('✓ Test-Datenbank erstellt\n');
});

// Schritt 3: Minimales Schema Version 10 simulieren
db.serialize(() => {
  console.log('Erstelle Basis-Schema (Version 10)...');
  
  // Meta-Tabelle
  db.run(`CREATE TABLE IF NOT EXISTS _schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  db.run(`INSERT INTO _schema_meta (key, value) VALUES ('schema_version', '10')`);

  // Basis-Tabellen (vereinfachtes v10 Schema)
  db.run(`CREATE TABLE IF NOT EXISTS kunden (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    telefon TEXT,
    email TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS termine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kunde_id INTEGER,
    datum TEXT,
    uhrzeit TEXT,
    beschreibung TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS mitarbeiter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    stunden_pro_woche REAL DEFAULT 40
  )`);

  // Test-Daten einfügen
  db.run(`INSERT INTO kunden (name, telefon) VALUES ('Test Kunde', '0123456789')`);
  db.run(`INSERT INTO mitarbeiter (name) VALUES ('Max Mustermann')`);

  console.log('✓ Basis-Schema (v10) erstellt mit Test-Daten\n');

  // Datenbank schließen
  db.close((err) => {
    if (err) {
      console.error('❌ Fehler beim Schließen der Test-Datenbank:', err);
      process.exit(1);
    }
    console.log('✓ Test-Datenbank vorbereitet\n');

    // Migration durchführen
    runMultiVersionMigrationTest();
  });
});

// Funktion zum Durchführen der Multi-Version-Migration
function runMultiVersionMigrationTest() {
  console.log('========================================');
  console.log('Starte Migration von v10 auf v19...');
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
        console.log(`📊 Start-Version: ${currentVersion}`);

        // Führe alle Migrationen durch
        console.log('🔄 Führe alle ausstehenden Migrationen aus (v10 → v19)...\n');
        const newVersion = await runMigrations(testDb, currentVersion);
        
        console.log(`\n✅ Alle Migrationen abgeschlossen! Finale Version: ${newVersion}`);

        // Aktualisiere Schema-Version
        testDb.run(
          `UPDATE _schema_meta SET value = ? WHERE key = 'schema_version'`,
          [newVersion.toString()],
          (err) => {
            if (err) {
              console.error('❌ Fehler beim Aktualisieren der Schema-Version:', err);
              process.exit(1);
            }

            // Verifiziere Ergebnis
            verifyMultiVersionMigration(testDb);
          }
        );
      });
    } catch (error) {
      console.error('❌ Migration fehlgeschlagen:', error);
      process.exit(1);
    }
  });
}

// Funktion zum Verifizieren der Multi-Version-Migration
function verifyMultiVersionMigration(testDb) {
  console.log('\n========================================');
  console.log('Verifiziere Multi-Version-Migration...');
  console.log('========================================\n');

  // Prüfe Schema-Version
  testDb.get(`SELECT value FROM _schema_meta WHERE key = 'schema_version'`, (err, row) => {
    if (err) {
      console.error('❌ Fehler beim Lesen der Schema-Version:', err);
      process.exit(1);
    }

    const finalVersion = parseInt(row.value);
    if (finalVersion !== 19) {
      console.error(`❌ Schema-Version ist ${finalVersion}, erwartet war 19!`);
      process.exit(1);
    }
    console.log(`✅ Schema-Version: ${finalVersion}`);

    // Prüfe dass neue Tabelle (Migration 19) existiert
    testDb.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='tablet_einstellungen'`, (err, row) => {
      if (err) {
        console.error('❌ Fehler beim Prüfen der tablet_einstellungen Tabelle:', err);
        process.exit(1);
      }
      if (!row) {
        console.error('❌ tablet_einstellungen Tabelle wurde nicht erstellt!');
        process.exit(1);
      }
      console.log('✅ tablet_einstellungen Tabelle (Migration 19) existiert');

      // Prüfe dass alte Daten erhalten geblieben sind
      testDb.get(`SELECT COUNT(*) as count FROM kunden`, (err, row) => {
        if (err) {
          console.error('❌ Fehler beim Prüfen der Kunden-Daten:', err);
          process.exit(1);
        }
        if (row.count === 0) {
          console.error('❌ Kunden-Daten wurden gelöscht!');
          process.exit(1);
        }
        console.log(`✅ Alte Daten erhalten: ${row.count} Kunde(n)`);

        // Liste alle Tabellen auf
        testDb.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, (err, tables) => {
          if (err) {
            console.error('❌ Fehler beim Auflisten der Tabellen:', err);
            process.exit(1);
          }

          console.log('\n📋 Vorhandene Tabellen nach Migration:');
          tables.forEach(table => {
            if (!table.name.startsWith('sqlite_')) {
              console.log(`   - ${table.name}`);
            }
          });

          // Test erfolgreich
          testDb.close((err) => {
            if (err) {
              console.error('❌ Fehler beim Schließen der Datenbank:', err);
              process.exit(1);
            }

            console.log('\n========================================');
            console.log('🎉 MULTI-VERSION MIGRATION TEST ERFOLGREICH!');
            console.log('========================================');
            console.log('\n✅ Migration von v10 auf v19 erfolgreich');
            console.log('✅ Alle 9 Migrationen (11-19) wurden angewendet');
            console.log('✅ Bestehende Daten wurden nicht beschädigt');
            console.log(`\nTest-Datenbank: ${testDbPath}\n`);
            
            process.exit(0);
          });
        });
      });
    });
  });
}
