/**
 * Test-Setup Helper
 * 
 * Erstellt eine isolierte Test-Datenbank als Kopie der Original-DB,
 * damit Tests gegen echte Schemas laufen ohne Produktivdaten zu ändern.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Pfade
const BACKEND_DIR = path.join(__dirname, '..', '..');
const ORIGINAL_DB = path.join(BACKEND_DIR, 'database', 'werkstatt.db');
const TEST_DB = path.join(__dirname, '..', 'test-werkstatt.db');

/**
 * Erstellt eine frische Test-DB mit dem kompletten Schema der Original-DB.
 * Kopiert Schema (ohne Daten) oder die DB-Datei.
 */
async function createTestDb() {
  // Alte Test-DB entfernen
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(TEST_DB, async (err) => {
      if (err) return reject(err);

      // Schema aus Original-DB kopieren (nur Struktur, keine Daten)
      if (fs.existsSync(ORIGINAL_DB)) {
        const origDb = new sqlite3.Database(ORIGINAL_DB, sqlite3.OPEN_READONLY, (origErr) => {
          if (origErr) {
            console.warn('Konnte Original-DB nicht öffnen, erstelle Schema manuell');
            createSchemaManually(db).then(() => resolve(db)).catch(reject);
            return;
          }

          // Hole alle CREATE TABLE Statements
          origDb.all(
            "SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
            [],
            (queryErr, rows) => {
              origDb.close();

              if (queryErr || !rows || rows.length === 0) {
                createSchemaManually(db).then(() => resolve(db)).catch(reject);
                return;
              }

              // Führe alle CREATE TABLE aus
              db.serialize(() => {
                for (const row of rows) {
                  db.run(row.sql.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
                }
                db.run("SELECT 1", () => resolve(db));
              });
            }
          );
        });
      } else {
        // Kein Original-DB vorhanden → Schema manuell erstellen
        createSchemaManually(db).then(() => resolve(db)).catch(reject);
      }
    });
  });
}

/**
 * Erstellt das Schema manuell (Fallback wenn keine Original-DB vorhanden)
 */
async function createSchemaManually(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS kunden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      telefon TEXT,
      email TEXT,
      adresse TEXT,
      notizen TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      kundennummer TEXT,
      firma TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS mitarbeiter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      farbe TEXT DEFAULT '#3498db',
      aktiv INTEGER DEFAULT 1,
      position TEXT,
      telefon TEXT,
      email TEXT,
      notizen TEXT,
      mittagspause_start TEXT DEFAULT '12:00',
      pausenminuten INTEGER DEFAULT 30,
      samstag_start TEXT,
      samstag_ende TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS lehrlinge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      farbe TEXT DEFAULT '#e67e22',
      aktiv INTEGER DEFAULT 1,
      lehrjahr INTEGER DEFAULT 1,
      telefon TEXT,
      email TEXT,
      aufgabenbewaeltigung INTEGER DEFAULT 50,
      notizen TEXT,
      berufsschul_wochen TEXT,
      mittagspause_start TEXT DEFAULT '12:00',
      pausenminuten INTEGER DEFAULT 30,
      samstag_start TEXT,
      samstag_ende TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS termine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_nr TEXT UNIQUE,
      kunde_id INTEGER,
      kunde_name TEXT,
      kunde_telefon TEXT,
      kennzeichen TEXT NOT NULL,
      datum TEXT NOT NULL,
      bring_zeit TEXT,
      geschaetzte_zeit INTEGER NOT NULL,
      arbeit TEXT NOT NULL,
      umfang TEXT,
      status TEXT DEFAULT 'geplant',
      mitarbeiter_id INTEGER,
      ersatzauto INTEGER DEFAULT 0,
      notizen TEXT,
      abholung_typ TEXT,
      abholung_zeit TEXT,
      abholung_details TEXT,
      kontakt_option TEXT,
      teile_status TEXT DEFAULT 'vorraetig',
      kilometerstand TEXT,
      arbeitszeiten_details TEXT,
      dringlichkeit TEXT DEFAULT 'normal',
      vin TEXT,
      fahrzeugtyp TEXT,
      erweiterung_von_id INTEGER,
      ist_erweiterung INTEGER DEFAULT 0,
      erweiterung_typ TEXT,
      startzeit TEXT,
      endzeit_berechnet TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      geloescht_am DATETIME,
      schwebend INTEGER DEFAULT 0,
      verschoben_von_datum TEXT,
      mitarbeiter_ids TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS werkstatt_einstellungen (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      pufferzeit_minuten INTEGER DEFAULT 15,
      servicezeit_minuten INTEGER DEFAULT 10,
      ersatzauto_anzahl INTEGER DEFAULT 2,
      nebenzeit_prozent REAL DEFAULT 0,
      mittagspause_minuten INTEGER DEFAULT 30,
      chatgpt_api_key TEXT,
      ki_enabled INTEGER DEFAULT 1,
      ki_mode TEXT DEFAULT 'local',
      ki_external_url TEXT,
      realtime_enabled INTEGER DEFAULT 1,
      smart_scheduling_enabled INTEGER DEFAULT 1,
      anomaly_detection_enabled INTEGER DEFAULT 1,
      letzter_zugriff_datum TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS abwesenheiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER,
      lehrling_id INTEGER,
      typ TEXT NOT NULL,
      von_datum TEXT NOT NULL,
      bis_datum TEXT NOT NULL,
      notizen TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS arbeitszeiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dauer_minuten INTEGER NOT NULL,
      kategorie TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ersatzautos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kennzeichen TEXT NOT NULL,
      marke TEXT,
      modell TEXT,
      baujahr INTEGER,
      farbe TEXT,
      status TEXT DEFAULT 'verfuegbar',
      notizen TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS fahrzeuge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kunde_id INTEGER,
      kennzeichen TEXT,
      marke TEXT,
      modell TEXT,
      baujahr INTEGER,
      farbe TEXT,
      vin TEXT,
      fahrzeugtyp TEXT,
      letzte_inspektion TEXT,
      naechste_inspektion TEXT,
      kilometerstand TEXT,
      notizen TEXT,
      tuev_datum TEXT,
      hu_datum TEXT,
      kraftstoff TEXT,
      getriebe TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS pause_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER,
      lehrling_id INTEGER,
      pause_start_zeit TEXT NOT NULL,
      pause_ende_zeit TEXT,
      pause_naechster_termin_id INTEGER,
      datum TEXT,
      abgeschlossen INTEGER DEFAULT 0,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS teile_bestellungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id INTEGER,
      bezeichnung TEXT NOT NULL,
      menge INTEGER DEFAULT 1,
      status TEXT DEFAULT 'bestellt',
      notizen TEXT,
      preis REAL,
      lieferant TEXT,
      bestell_nr TEXT,
      bestellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      geliefert_am DATETIME,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS tablet_einstellungen (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      display_timer_enabled INTEGER DEFAULT 0,
      display_on_time TEXT DEFAULT '07:00',
      display_off_time TEXT DEFAULT '18:00',
      refresh_interval INTEGER DEFAULT 30
    )`,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      for (const sql of statements) {
        db.run(sql);
      }
      // Standard-Einstellungen einfügen
      db.run(`INSERT OR IGNORE INTO werkstatt_einstellungen (
        id, pufferzeit_minuten, servicezeit_minuten, ersatzauto_anzahl, 
        nebenzeit_prozent, mittagspause_minuten
      ) VALUES (1, 15, 10, 2, 0, 30)`);

      db.run("SELECT 1", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

/**
 * Promise-Wrapper für db.run
 */
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Promise-Wrapper für db.get
 */
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Promise-Wrapper für db.all
 */
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Schließt die Test-DB und räumt auf
 */
async function closeTestDb(db) {
  return new Promise((resolve) => {
    if (db) {
      db.close((err) => {
        if (err) console.warn('Fehler beim Schließen der Test-DB:', err.message);
        // Lösche Test-DB-Datei
        if (fs.existsSync(TEST_DB)) {
          try {
            fs.unlinkSync(TEST_DB);
          } catch (e) {
            console.warn('Konnte Test-DB nicht löschen:', e.message);
          }
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Seedet Test-Daten für Mitarbeiter
 */
async function seedMitarbeiter(db) {
  await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv, pausenzeit_minuten, mittagspause_start, samstag_aktiv, samstag_start, samstag_ende) 
    VALUES (1, 'Max Mustermann', 1, 30, '12:00', 1, '08:00', '13:00')`);
  await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv, pausenzeit_minuten, mittagspause_start, samstag_aktiv) 
    VALUES (2, 'Anna Schmidt', 1, 45, '12:30', 0)`);
  await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv, pausenzeit_minuten) 
    VALUES (3, 'Peter Müller', 0, 30)`);
}

/**
 * Seedet Test-Daten für Lehrlinge
 */
async function seedLehrlinge(db) {
  await dbRun(db, `INSERT INTO lehrlinge (id, name, aktiv, aufgabenbewaeltigung_prozent, pausenzeit_minuten) 
    VALUES (1, 'Tim Lehrling', 1, 50, 30)`);
}

/**
 * Seedet Test-Daten für Kunden
 */
async function seedKunden(db) {
  await dbRun(db, `INSERT INTO kunden (id, name, telefon, email) 
    VALUES (1, 'Test Kunde', '0123456789', 'test@example.com')`);
  await dbRun(db, `INSERT INTO kunden (id, name, telefon) 
    VALUES (2, 'Zweiter Kunde', '0987654321')`);
}

/**
 * Seedet Test-Termine
 */
async function seedTermine(db, datum = '2026-02-06') {
  await dbRun(db, `INSERT INTO termine (id, termin_nr, kunde_id, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id, ersatzauto)
    VALUES (1, 'T-2026-001', 1, 'Test Kunde', 'AB-CD-1234', ?, '08:00', 60, 'Ölwechsel', 'geplant', 1, 0)`, [datum]);
  await dbRun(db, `INSERT INTO termine (id, termin_nr, kunde_id, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id, ersatzauto)
    VALUES (2, 'T-2026-002', 1, 'Test Kunde', 'AB-CD-1234', ?, '09:30', 120, 'Bremsen wechseln', 'geplant', 1, 1)`, [datum]);
  await dbRun(db, `INSERT INTO termine (id, termin_nr, kunde_id, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id, ersatzauto)
    VALUES (3, 'T-2026-003', 2, 'Zweiter Kunde', 'XY-ZZ-5678', ?, '10:00', 90, 'TÜV Vorbereitung', 'in_arbeit', 2, 0)`, [datum]);
}

module.exports = {
  createTestDb,
  closeTestDb,
  dbRun,
  dbGet,
  dbAll,
  seedMitarbeiter,
  seedLehrlinge,
  seedKunden,
  seedTermine,
  TEST_DB
};
