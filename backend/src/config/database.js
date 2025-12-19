const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || process.cwd();
const dbPath = process.env.DB_PATH || path.join(dataDir, 'database', 'werkstatt.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fehler beim Öffnen der Datenbank:', err);
  } else {
    console.log('Datenbank verbunden:', dbPath);
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS kunden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      telefon TEXT,
      email TEXT,
      adresse TEXT,
      locosoft_id TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS termine (
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

    db.run(`ALTER TABLE termine ADD COLUMN kunde_name TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kunde_name:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN kunde_telefon TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kunde_telefon:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN abholung_typ TEXT DEFAULT 'abholung'`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von abholung_typ:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN abholung_details TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von abholung_details:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN abholung_zeit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von abholung_zeit:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN bring_zeit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von bring_zeit:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN kontakt_option TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kontakt_option:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN kilometerstand INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kilometerstand:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN ersatzauto INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von ersatzauto:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN termin_nr TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von termin_nr:', err);
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS arbeitszeiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bezeichnung TEXT NOT NULL,
      standard_minuten INTEGER NOT NULL
    )`);

    db.get("SELECT COUNT(*) as count FROM arbeitszeiten", (err, row) => {
      if (!err && row.count === 0) {
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
        stmt.finalize();
        console.log('Standardarbeiten initialisiert');
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS werkstatt_einstellungen (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mitarbeiter_anzahl INTEGER DEFAULT 1,
      arbeitsstunden_pro_tag INTEGER DEFAULT 8
    )`);

    db.run(
      `INSERT OR IGNORE INTO werkstatt_einstellungen (id, mitarbeiter_anzahl, arbeitsstunden_pro_tag)
       VALUES (1, 1, 8)`
    );

    db.run(`CREATE TABLE IF NOT EXISTS abwesenheiten (
      datum TEXT PRIMARY KEY,
      urlaub INTEGER DEFAULT 0,
      krank INTEGER DEFAULT 0
    )`);
  });
}

module.exports = { db, initializeDatabase, dbPath, dataDir };
