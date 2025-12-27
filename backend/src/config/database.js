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

    db.run(`ALTER TABLE termine ADD COLUMN arbeitszeiten_details TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von arbeitszeiten_details:', err);
      }
    });

    db.run(`ALTER TABLE termine ADD COLUMN mitarbeiter_id INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von mitarbeiter_id:', err);
      }
    });

    // Papierkorb: geloescht_am Feld für Soft-Delete
    db.run(`ALTER TABLE termine ADD COLUMN geloescht_am DATETIME`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von geloescht_am:', err);
      }
    });

    // Mitarbeiter-Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS mitarbeiter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      arbeitsstunden_pro_tag INTEGER DEFAULT 8,
      nebenzeit_prozent REAL DEFAULT 0,
      aktiv INTEGER DEFAULT 1,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migration: ordnungszeit_prozent zu nebenzeit_prozent umbenennen (falls vorhanden)
    db.run(`ALTER TABLE mitarbeiter ADD COLUMN nebenzeit_prozent REAL DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        // Wenn Spalte nicht existiert, versuche Migration von alter Spalte
        db.all("PRAGMA table_info(mitarbeiter)", (err, columns) => {
          if (!err && columns) {
            const hasOrdnungszeit = columns.some(c => c.name === 'ordnungszeit_prozent');
            const hasNebenzeit = columns.some(c => c.name === 'nebenzeit_prozent');
            if (hasOrdnungszeit && !hasNebenzeit) {
              // Kopiere Daten von ordnungszeit_prozent zu nebenzeit_prozent
              db.run(`UPDATE mitarbeiter SET nebenzeit_prozent = ordnungszeit_prozent WHERE nebenzeit_prozent = 0`, (err) => {
                if (err) console.error('Fehler bei Migration ordnungszeit_prozent:', err);
              });
            }
          }
        });
      }
    });

    // Spalte nur_service hinzufügen (wenn Mitarbeiter nur Service macht, keine Werkstattaufgaben)
    db.run(`ALTER TABLE mitarbeiter ADD COLUMN nur_service INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von nur_service:', err);
      }
    });

    // Lehrlinge-Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS lehrlinge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nebenzeit_prozent REAL DEFAULT 0,
      aufgabenbewaeltigung_prozent REAL DEFAULT 100,
      aktiv INTEGER DEFAULT 1,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migration: ordnungszeit_prozent zu nebenzeit_prozent umbenennen (falls vorhanden)
    db.run(`ALTER TABLE lehrlinge ADD COLUMN nebenzeit_prozent REAL DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        // Wenn Spalte nicht existiert, versuche Migration von alter Spalte
        db.all("PRAGMA table_info(lehrlinge)", (err, columns) => {
          if (!err && columns) {
            const hasOrdnungszeit = columns.some(c => c.name === 'ordnungszeit_prozent');
            const hasNebenzeit = columns.some(c => c.name === 'nebenzeit_prozent');
            if (hasOrdnungszeit && !hasNebenzeit) {
              // Kopiere Daten von ordnungszeit_prozent zu nebenzeit_prozent
              db.run(`UPDATE lehrlinge SET nebenzeit_prozent = ordnungszeit_prozent WHERE nebenzeit_prozent = 0`, (err) => {
                if (err) console.error('Fehler bei Migration ordnungszeit_prozent:', err);
              });
            }
          }
        });
      }
    });

    // Arbeitsstunden pro Tag für Lehrlinge hinzufügen
    db.run(`ALTER TABLE lehrlinge ADD COLUMN arbeitsstunden_pro_tag INTEGER DEFAULT 8`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von arbeitsstunden_pro_tag:', err);
      }
    });

    // Foreign Key für mitarbeiter_id (SQLite unterstützt keine ALTER TABLE ADD CONSTRAINT, daher nur Index)
    db.run(`CREATE INDEX IF NOT EXISTS idx_termine_mitarbeiter_id ON termine(mitarbeiter_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_mitarbeiter_id:', err);
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
      arbeitsstunden_pro_tag INTEGER DEFAULT 8,
      pufferzeit_minuten INTEGER DEFAULT 15
    )`);

    db.run(
      `INSERT OR IGNORE INTO werkstatt_einstellungen (id, mitarbeiter_anzahl, arbeitsstunden_pro_tag, pufferzeit_minuten)
       VALUES (1, 1, 8, 15)`
    );

    // Füge Pufferzeit-Spalte hinzu falls sie nicht existiert
    db.run(`ALTER TABLE werkstatt_einstellungen ADD COLUMN pufferzeit_minuten INTEGER DEFAULT 15`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von pufferzeit_minuten:', err);
      }
    });

    // Füge Servicezeit-Spalte hinzu falls sie nicht existiert
    db.run(`ALTER TABLE werkstatt_einstellungen ADD COLUMN servicezeit_minuten INTEGER DEFAULT 10`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von servicezeit_minuten:', err);
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS abwesenheiten (
      datum TEXT PRIMARY KEY,
      urlaub INTEGER DEFAULT 0,
      krank INTEGER DEFAULT 0
    )`);

    // Neue Tabelle für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
    db.run(`CREATE TABLE IF NOT EXISTS mitarbeiter_abwesenheiten (
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

    // Indizes für mitarbeiter_abwesenheiten
    db.run(`CREATE INDEX IF NOT EXISTS idx_ma_abw_mitarbeiter ON mitarbeiter_abwesenheiten(mitarbeiter_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_ma_abw_mitarbeiter:', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_ma_abw_lehrling ON mitarbeiter_abwesenheiten(lehrling_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_ma_abw_lehrling:', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_ma_abw_datum ON mitarbeiter_abwesenheiten(von_datum, bis_datum)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_ma_abw_datum:', err);
    });

    // Erstelle Indizes für bessere Performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_termine_datum ON termine(datum)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_datum:', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_termine_status ON termine(status)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_status:', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_termine_kunde_id ON termine(kunde_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_kunde_id:', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_termine_datum_status ON termine(datum, status)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_datum_status:', err);
    });
  });
}

module.exports = { db, initializeDatabase, dbPath, dataDir };
