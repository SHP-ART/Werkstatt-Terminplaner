/**
 * Schema-Kompatibilitäts-Modul
 * Konvertiert alte _schema_meta Datenbanken zum neuen schema_migrations System
 */

const sqlite3 = require('sqlite3').verbose();

/**
 * Prüft ob die Datenbank das alte _schema_meta System verwendet
 * und konvertiert es automatisch zum neuen schema_migrations System
 */
async function ensureSchemaCompatibility(db) {
  return new Promise((resolve, reject) => {
    // Prüfe ob schema_migrations existiert
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`, async (err, row) => {
      if (err) {
        return reject(err);
      }

      if (row) {
        // Neues System bereits vorhanden - nichts zu tun
        console.log('✓ Schema-System: schema_migrations (aktuell)');
        return resolve({ converted: false, message: 'Bereits aktuelles System' });
      }

      // Prüfe ob _schema_meta existiert
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='_schema_meta'`, async (err, hasOldSystem) => {
        if (err) {
          return reject(err);
        }

        if (!hasOldSystem) {
          // Weder altes noch neues System - das ist eine frische DB
          console.log('✓ Schema-System: Neue Datenbank (wird initialisiert)');
          return resolve({ converted: false, message: 'Neue Datenbank' });
        }

        // ALTE DB ERKANNT - Konvertierung durchführen
        console.log('\n╔═══════════════════════════════════════════════════════════════╗');
        console.log('║  🔄 ALTE DATENBANK ERKANNT - AUTOMATISCHE KONVERTIERUNG      ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝\n');

        try {
          await convertOldToNewSchema(db);
          resolve({ converted: true, message: 'Erfolgreich von _schema_meta zu schema_migrations konvertiert' });
        } catch (conversionError) {
          reject(conversionError);
        }
      });
    });
  });
}

/**
 * Konvertiert eine alte _schema_meta Datenbank zum neuen System
 */
async function convertOldToNewSchema(db) {
  // Schritt 1: Lese alte Version
  const oldVersion = await new Promise((resolve, reject) => {
    db.get(`SELECT value FROM _schema_meta WHERE key='schema_version'`, (err, row) => {
      if (err) reject(err);
      else resolve(row ? parseInt(row.value, 10) : 0);
    });
  });

  console.log(`📊 Alte Schema-Version: ${oldVersion}`);

  // Schritt 2: Erstelle neue schema_migrations Tabelle
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
  console.log('✓ Tabelle schema_migrations erstellt');

  // Schritt 3: Mapping alte Version → neue Migrationen
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
    11: { version: 18, name: 'complete_arbeitszeiten_details' } // Version 11 = Migration 18
  };

  // Schritt 4: Übertrage Migrations-Historie
  console.log('📝 Übertrage Migrations-Historie...');
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
      console.log(`  ✓ Migration ${migration.version} (${migration.name})`);
    }
  }

  // Schritt 5: Prüfe und ergänze fehlende Strukturen
  console.log('🔧 Prüfe fehlende Strukturen...');

  // 5a. verschoben_von_datum (Migration 019)
  const hasVerschoben = await new Promise((resolve) => {
    db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='termine'`, (err, row) => {
      if (err || !row) resolve(false);
      else resolve(row.sql.includes('verschoben_von_datum'));
    });
  });

  if (!hasVerschoben) {
    await new Promise((resolve, reject) => {
      db.run(`ALTER TABLE termine ADD COLUMN verschoben_von_datum TEXT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) reject(err);
        else resolve();
      });
    });
    console.log('  ✓ Spalte verschoben_von_datum hinzugefügt');
  }

  // 5b. pause_tracking Tabelle (Migration 019)
  const hasPauseTracking = await new Promise((resolve) => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='pause_tracking'`, (err, row) => {
      resolve(!!row);
    });
  });

  if (!hasPauseTracking) {
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
    console.log('  ✓ Tabelle pause_tracking erstellt');
  }

  // 5c. tablet_einstellungen Tabelle (Migration 020)
  const hasTabletSettings = await new Promise((resolve) => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='tablet_einstellungen'`, (err, row) => {
      resolve(!!row);
    });
  });

  if (!hasTabletSettings) {
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
    console.log('  ✓ Tabelle tablet_einstellungen erstellt');
  }

  // Schritt 6: Trage Migrationen 019 und 020 ein
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

  // Schritt 7: Zusammenfassung
  const finalVersion = await new Promise((resolve) => {
    db.get(`SELECT MAX(version) as max_version FROM schema_migrations`, (err, row) => {
      if (err || !row) resolve(0);
      else resolve(row.max_version);
    });
  });

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  ✅ KONVERTIERUNG ERFOLGREICH - Schema-Version: ${finalVersion}         ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
}

module.exports = {
  ensureSchemaCompatibility,
  convertOldToNewSchema
};
