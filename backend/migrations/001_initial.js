/**
 * Migration 001: Basis-Schema
 * Erstellt die grundlegenden Tabellen für das Werkstatt-Terminplaner System
 */

const { safeCreateTable } = require('./helpers');

module.exports = {
  version: 1,
  description: 'Basis-Schema (Kunden, Termine, Mitarbeiter, Lehrlinge, Arbeitszeiten)',

  async up(db) {
    // Kunden-Tabelle
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS kunden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      telefon TEXT,
      email TEXT,
      adresse TEXT,
      locosoft_id TEXT,
      kennzeichen TEXT,
      vin TEXT,
      fahrzeugtyp TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Termine-Tabelle (Basis-Felder)
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS termine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_nr TEXT UNIQUE,
      kunde_id INTEGER,
      kunde_name TEXT,
      kunde_telefon TEXT,
      kennzeichen TEXT NOT NULL,
      arbeit TEXT NOT NULL,
      umfang TEXT,
      geschaetzte_zeit INTEGER NOT NULL,
      tatsaechliche_zeit INTEGER,
      datum DATE NOT NULL,
      status TEXT DEFAULT 'geplant',
      abholung_typ TEXT DEFAULT 'abholung',
      abholung_details TEXT,
      abholung_zeit TEXT,
      bring_zeit TEXT,
      kontakt_option TEXT,
      kilometerstand INTEGER,
      ersatzauto INTEGER DEFAULT 0,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (kunde_id) REFERENCES kunden(id)
    )`);

    // Mitarbeiter-Tabelle
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS mitarbeiter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      arbeitsstunden_pro_tag INTEGER DEFAULT 8,
      nebenzeit_prozent REAL DEFAULT 0,
      aktiv INTEGER DEFAULT 1,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Lehrlinge-Tabelle
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS lehrlinge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nebenzeit_prozent REAL DEFAULT 0,
      aufgabenbewaeltigung_prozent REAL DEFAULT 100,
      aktiv INTEGER DEFAULT 1,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Arbeitszeiten-Tabelle
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS arbeitszeiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bezeichnung TEXT NOT NULL,
      standard_minuten INTEGER NOT NULL,
      aliase TEXT DEFAULT ''
    )`);

    // Werkstatt-Einstellungen
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS werkstatt_einstellungen (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mitarbeiter_anzahl INTEGER DEFAULT 1,
      arbeitsstunden_pro_tag INTEGER DEFAULT 8,
      pufferzeit_minuten INTEGER DEFAULT 15
    )`);

    // Standard-Einstellungen einfügen
    await new Promise((resolve) => {
      db.run(
        `INSERT OR IGNORE INTO werkstatt_einstellungen (id, mitarbeiter_anzahl, arbeitsstunden_pro_tag, pufferzeit_minuten)
         VALUES (1, 1, 8, 15)`,
        () => resolve()
      );
    });

    // Abwesenheiten-Tabelle (global)
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS abwesenheiten (
      datum TEXT PRIMARY KEY,
      urlaub INTEGER DEFAULT 0,
      krank INTEGER DEFAULT 0
    )`);

    // Mitarbeiter-Abwesenheiten (individuell)
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS mitarbeiter_abwesenheiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER,
      lehrling_id INTEGER,
      typ TEXT NOT NULL CHECK (typ IN ('urlaub', 'krank')),
      von_datum DATE NOT NULL,
      bis_datum DATE NOT NULL,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id),
      FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id)
    )`);

    // Schema-Meta Tabelle für Versionierung
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS _schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    // Standardarbeiten initialisieren (falls Tabelle leer)
    await new Promise((resolve) => {
      db.get("SELECT COUNT(*) as count FROM arbeitszeiten", (err, row) => {
        if (!err && row && row.count === 0) {
          const standardArbeiten = [
            ['Ölwechsel', 30],
            ['Inspektion klein', 60],
            ['Inspektion groß', 120],
            ['Bremsen vorne', 90],
            ['Bremsen hinten', 90],
            ['Reifen wechseln', 45],
            ['TÜV-Vorbereitung', 60],
            ['Diagnose', 30]
          ];

          const stmt = db.prepare("INSERT INTO arbeitszeiten (bezeichnung, standard_minuten) VALUES (?, ?)");
          standardArbeiten.forEach(arbeit => {
            stmt.run(arbeit);
          });
          stmt.finalize(() => {
            console.log('📋 Standardarbeiten initialisiert');
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  },

  async down(db) {
    // Rollback - Tabellen löschen (in umgekehrter Reihenfolge wegen Foreign Keys)
    const tables = [
      '_schema_meta',
      'mitarbeiter_abwesenheiten',
      'abwesenheiten',
      'werkstatt_einstellungen',
      'arbeitszeiten',
      'lehrlinge',
      'mitarbeiter',
      'termine',
      'kunden'
    ];

    for (const table of tables) {
      await new Promise((resolve) => {
        db.run(`DROP TABLE IF EXISTS ${table}`, () => resolve());
      });
    }
  }
};
