/**
 * MIGRATIONS-KOMPATIBILITÄT FIX
 * 
 * Dieses Script konvertiert alte Datenbanken (_schema_meta)
 * zum neuen Migrations-System (schema_migrations)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database', 'werkstatt.db');
const backupDir = path.join(__dirname, 'backups');

// Erstelle Backup vor der Konvertierung
function createBackup() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupPath = path.join(backupDir, `werkstatt_pre_migration_fix_${timestamp}.db`);
  
  fs.copyFileSync(dbPath, backupPath);
  console.log(`✓ Backup erstellt: ${backupPath}`);
  return backupPath;
}

// Hauptfunktion
async function fixMigrationCompatibility() {
  console.log('=== MIGRATIONS-KOMPATIBILITÄTS-FIX ===\n');

  // Backup erstellen
  const backupPath = createBackup();

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Fehler beim Öffnen der Datenbank:', err);
      process.exit(1);
    }
  });

  // Schritt 1: Prüfe aktuelles System
  console.log('Schritt 1: Analysiere aktuelles Schema-System...');
  
  const hasOldSystem = await new Promise((resolve) => {
    db.get(`SELECT name FROM sqlite_master WHERE name='_schema_meta'`, (err, row) => {
      resolve(!!row);
    });
  });

  const hasNewSystem = await new Promise((resolve) => {
    db.get(`SELECT name FROM sqlite_master WHERE name='schema_migrations'`, (err, row) => {
      resolve(!!row);
    });
  });

  if (hasOldSystem && !hasNewSystem) {
    console.log('  ✓ Alte DB erkannt (_schema_meta)');
    console.log('  → Konvertierung zum neuen System erforderlich\n');
  } else if (hasNewSystem) {
    console.log('  ✓ Neue DB erkannt (schema_migrations)');
    console.log('  → Keine Konvertierung erforderlich\n');
    db.close();
    return;
  } else {
    console.log('  ✗ Unbekanntes Schema-System!');
    db.close();
    process.exit(1);
  }

  // Schritt 2: Lese alte Version
  const oldVersion = await new Promise((resolve) => {
    db.get(`SELECT value FROM _schema_meta WHERE key='schema_version'`, (err, row) => {
      if (err || !row) resolve(0);
      else resolve(parseInt(row.value, 10));
    });
  });

  console.log(`Schritt 2: Alte Schema-Version: ${oldVersion}`);

  // Schritt 3: Erstelle neue schema_migrations Tabelle
  console.log('\nSchritt 3: Erstelle schema_migrations Tabelle...');
  
  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  console.log('  ✓ schema_migrations Tabelle erstellt');

  // Schritt 4: Übertrage alte Versionen
  console.log('\nSchritt 4: Übertrage Migrations-Historie...');
  
  // Mapping: Alte Schema-Versionen → Neue Migration-Nummern
  const versionMapping = {
    1: { version: 1, name: 'initial_schema' },
    2: { version: 2, name: 'termine_basis' },
    3: { version: 3, name: 'termine_erweitert' },
    4: { version: 4, name: 'kunden_fahrzeuge' },
    5: { version: 5, name: 'arbeitszeiten' },
    6: { version: 6, name: 'abwesenheiten' },
    7: { version: 7, name: 'ersatzautos' },
    8: { version: 8, name: 'teile_bestellungen' },
    9: { version: 9, name: 'termin_phasen' },
    10: { version: 10, name: 'werkstatt_einstellungen' },
    11: { version: 18, name: 'complete_arbeitszeiten_details' } // Version 11 entspricht Migration 18
  };

  for (let v = 1; v <= oldVersion; v++) {
    const migration = versionMapping[v];
    if (migration) {
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
          VALUES (?, ?, datetime('now'))
        `, [migration.version, migration.name], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log(`  ✓ Migration ${migration.version} (${migration.name}) eingetragen`);
    }
  }

  // Schritt 5: Prüfe fehlende Spalten/Tabellen
  console.log('\nSchritt 5: Prüfe und ergänze fehlende Strukturen...');

  // Prüfe verschoben_von_datum (Migration 019)
  const hasVerschoben = await new Promise((resolve) => {
    db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='termine'`, (err, row) => {
      if (err || !row) resolve(false);
      else resolve(row.sql.includes('verschoben_von_datum'));
    });
  });

  if (!hasVerschoben) {
    console.log('  → Füge verschoben_von_datum hinzu (Migration 019)...');
    await new Promise((resolve, reject) => {
      db.run(`ALTER TABLE termine ADD COLUMN verschoben_von_datum TEXT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) reject(err);
        else resolve();
      });
    });
    console.log('  ✓ verschoben_von_datum hinzugefügt');
  } else {
    console.log('  ✓ verschoben_von_datum bereits vorhanden');
  }

  // Prüfe pause_tracking Tabelle (Migration 019)
  const hasPauseTracking = await new Promise((resolve) => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='pause_tracking'`, (err, row) => {
      resolve(!!row);
    });
  });

  if (!hasPauseTracking) {
    console.log('  → Erstelle pause_tracking Tabelle (Migration 019)...');
    await new Promise((resolve, reject) => {
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
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('  ✓ pause_tracking Tabelle erstellt');
  } else {
    console.log('  ✓ pause_tracking Tabelle bereits vorhanden');
  }

  // Prüfe tablet_einstellungen Tabelle (Migration 020)
  const hasTabletSettings = await new Promise((resolve) => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='tablet_einstellungen'`, (err, row) => {
      resolve(!!row);
    });
  });

  if (!hasTabletSettings) {
    console.log('  → Erstelle tablet_einstellungen Tabelle (Migration 020)...');
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS tablet_einstellungen (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          display_ein_zeit TEXT DEFAULT '07:00',
          display_aus_zeit TEXT DEFAULT '18:00',
          manuell_status TEXT DEFAULT 'auto',
          aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Initialen Eintrag erstellen
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT OR IGNORE INTO tablet_einstellungen (id, display_ein_zeit, display_aus_zeit, manuell_status)
        VALUES (1, '07:00', '18:00', 'auto')
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('  ✓ tablet_einstellungen Tabelle erstellt');
  } else {
    console.log('  ✓ tablet_einstellungen Tabelle bereits vorhanden');
  }

  // Trage Migrationen 019 und 020 ein
  await new Promise((resolve, reject) => {
    db.run(`
      INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
      VALUES (19, 'add_pause_tracking_and_verschoben', datetime('now'))
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
      VALUES (20, 'tablet_einstellungen', datetime('now'))
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log('  ✓ Migrationen 019 und 020 eingetragen');

  // Schritt 6: Zusammenfassung
  console.log('\nSchritt 6: Zusammenfassung...');
  
  const finalVersion = await new Promise((resolve) => {
    db.get(`SELECT MAX(version) as max_version FROM schema_migrations`, (err, row) => {
      if (err || !row) resolve(0);
      else resolve(row.max_version);
    });
  });

  const termineCount = await new Promise((resolve) => {
    db.get(`SELECT COUNT(*) as count FROM termine`, (err, row) => {
      if (err || !row) resolve(0);
      else resolve(row.count);
    });
  });

  console.log(`  ✓ Neue Schema-Version: ${finalVersion}`);
  console.log(`  ✓ Termine in DB: ${termineCount}`);
  console.log(`\n=== FIX ERFOLGREICH ===`);
  console.log(`Die Datenbank wurde erfolgreich konvertiert!`);
  console.log(`Backup: ${backupPath}`);

  db.close();
}

// Script ausführen
fixMigrationCompatibility().catch(err => {
  console.error('\n✗ FEHLER:', err);
  process.exit(1);
});
