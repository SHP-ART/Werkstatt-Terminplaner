const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Versionierung für DB-Schema (erhöhen bei Änderungen)
const DB_SCHEMA_VERSION = 2;

// Bestimme das Datenverzeichnis:
// Priorität:
// 1. Umgebungsvariable DATA_DIR (wird von electron-main.js gesetzt)
// 2. Umgebungsvariable ELECTRON_EXE_DIR (Fallback)
// 3. Bei gepackter Electron-App: Verzeichnis der EXE-Datei
// 4. Ansonsten: Das Verzeichnis, in dem der Server gestartet wurde (process.cwd())
function getDataDirectory() {
  // 1. Umgebungsvariable DATA_DIR hat höchste Priorität (von electron-main.js gesetzt)
  if (process.env.DATA_DIR) {
    console.log('DATA_DIR Umgebungsvariable gefunden:', process.env.DATA_DIR);
    return process.env.DATA_DIR;
  }
  
  // 2. Fallback: ELECTRON_EXE_DIR
  if (process.env.ELECTRON_EXE_DIR) {
    console.log('ELECTRON_EXE_DIR Umgebungsvariable gefunden:', process.env.ELECTRON_EXE_DIR);
    return process.env.ELECTRON_EXE_DIR;
  }
  
  // 3. Prüfe ob wir in einer gepackten Electron-App laufen
  // Erkennungsmethoden für gepackte Electron-Apps:
  
  // Methode A: process.resourcesPath existiert und app.asar ist vorhanden
  if (process.resourcesPath) {
    const asarPath = path.join(process.resourcesPath, 'app.asar');
    if (fs.existsSync(asarPath)) {
      const exeDir = path.dirname(process.execPath);
      console.log('Electron gepackte App erkannt (resourcesPath), EXE-Verzeichnis:', exeDir);
      return exeDir;
    }
  }
  
  // Methode B: process.mainModule enthält app.asar im Pfad
  if (process.mainModule && 
      process.mainModule.filename && 
      process.mainModule.filename.includes('app.asar')) {
    const exeDir = path.dirname(process.execPath);
    console.log('Electron gepackte App erkannt (mainModule), EXE-Verzeichnis:', exeDir);
    return exeDir;
  }
  
  // Methode C: Prüfe ob execPath eine .exe ist und resources-Ordner daneben existiert
  if (process.execPath && process.execPath.endsWith('.exe')) {
    const exeDir = path.dirname(process.execPath);
    const resourcesDir = path.join(exeDir, 'resources');
    if (fs.existsSync(resourcesDir)) {
      console.log('Electron gepackte App erkannt (exe+resources), EXE-Verzeichnis:', exeDir);
      return exeDir;
    }
  }
  
  // 4. Standard: Arbeitsverzeichnis (für Entwicklungsmodus)
  console.log('Entwicklungsmodus - verwende Arbeitsverzeichnis:', process.cwd());
  return process.cwd();
}

const dataDir = getDataDirectory();
const dbPath = process.env.DB_PATH || path.join(dataDir, 'database', 'werkstatt.db');
const dbDir = path.dirname(dbPath);

// Zeige Pfade beim Start an
console.log('Arbeitsverzeichnis:', process.cwd());
console.log('Daten-Verzeichnis:', dataDir);
console.log('Datenbank-Pfad:', dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('Datenbank-Verzeichnis erstellt:', dbDir);
}

// Datenbankverbindung als Objekt-Wrapper, damit Referenzen nach Reconnect aktualisiert werden
const dbWrapper = {
  connection: null
};

// Initiale Verbindung herstellen
dbWrapper.connection = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fehler beim Öffnen der Datenbank:', err);
  } else {
    console.log('Datenbank verbunden:', dbPath);
    // Performance-Optimierungen
    dbWrapper.connection.run('PRAGMA journal_mode = WAL;');
    dbWrapper.connection.run('PRAGMA synchronous = NORMAL;');
  }
});

// Proxy für abwärtskompatiblen Zugriff auf db-Methoden
const db = new Proxy({}, {
  get(target, prop) {
    // Spezialfall: Wenn connection selbst abgefragt wird
    if (prop === '_connection') {
      return dbWrapper.connection;
    }
    // Alle anderen Props/Methoden vom aktuellen Connection-Objekt holen
    const value = dbWrapper.connection[prop];
    if (typeof value === 'function') {
      return value.bind(dbWrapper.connection);
    }
    return value;
  }
});

// Funktion zum Neuladen der Datenbank-Verbindung (nach Backup-Restore)
function reconnectDatabase() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Schließe alte Datenbankverbindung...');
    dbWrapper.connection.close((closeErr) => {
      if (closeErr) {
        console.error('Fehler beim Schließen der alten Verbindung:', closeErr);
        // Trotzdem fortfahren
      }
      
      console.log('🔄 Öffne neue Datenbankverbindung...');
      dbWrapper.connection = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Fehler beim Öffnen der Datenbank:', err);
          reject(err);
        } else {
          console.log('✅ Datenbank neu verbunden:', dbPath);
          // Performance-Optimierungen
          dbWrapper.connection.run('PRAGMA journal_mode = WAL;');
          dbWrapper.connection.run('PRAGMA synchronous = NORMAL;');
          resolve(dbWrapper.connection);
        }
      });
    });
  });
}

// Getter für das aktuelle db-Objekt (für Module, die es importieren)
function getDb() {
  return dbWrapper.connection;
}

// Automatisches Backup vor Migrationen erstellen
function createAutoBackup() {
  return new Promise((resolve) => {
    try {
      // Prüfe ob Datenbank existiert
      if (!fs.existsSync(dbPath)) {
        console.log('📦 Keine bestehende Datenbank gefunden - kein Backup nötig');
        resolve(false);
        return;
      }

      // Backup-Verzeichnis erstellen
      const backupDir = path.join(dataDir, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Backup-Dateiname mit Zeitstempel
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupFileName = `werkstatt_backup_${timestamp}.db`;
      const backupPath = path.join(backupDir, backupFileName);

      // Backup erstellen
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ Automatisches Backup erstellt: ${backupPath}`);

      // Alte Backups aufräumen (behalte nur die letzten 10)
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('werkstatt_backup_') && f.endsWith('.db'))
        .sort()
        .reverse();

      if (backupFiles.length > 10) {
        const zuLoeschen = backupFiles.slice(10);
        zuLoeschen.forEach(file => {
          try {
            fs.unlinkSync(path.join(backupDir, file));
            console.log(`🗑️ Altes Backup gelöscht: ${file}`);
          } catch (e) {
            console.error(`Fehler beim Löschen von ${file}:`, e);
          }
        });
      }

      resolve(true);
    } catch (error) {
      console.error('⚠️ Fehler beim Erstellen des Backups:', error);
      resolve(false);
    }
  });
}

// Schema-Version in Datenbank speichern/prüfen
function checkAndUpdateSchemaVersion() {
  return new Promise((resolve) => {
    // Meta-Tabelle für Schema-Version erstellen
    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS _schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )`, (err) => {
      if (err) {
        console.error('Fehler beim Erstellen der Meta-Tabelle:', err);
        resolve({ needsMigration: false, oldVersion: 0 });
        return;
      }

      // Aktuelle Version auslesen
      dbWrapper.connection.get(`SELECT value FROM _schema_meta WHERE key = 'schema_version'`, (err, row) => {
        const currentVersion = row ? parseInt(row.value) : 0;
        const needsMigration = currentVersion < DB_SCHEMA_VERSION;

        if (needsMigration) {
          console.log(`📊 Schema-Migration nötig: Version ${currentVersion} → ${DB_SCHEMA_VERSION}`);
        } else {
          console.log(`📊 Schema-Version aktuell: ${currentVersion}`);
        }

        resolve({ needsMigration, oldVersion: currentVersion });
      });
    });
  });
}

// Schema-Version nach Migration aktualisieren
function updateSchemaVersion() {
  return new Promise((resolve) => {
    dbWrapper.connection.run(
      `INSERT OR REPLACE INTO _schema_meta (key, value) VALUES ('schema_version', ?)`,
      [DB_SCHEMA_VERSION.toString()],
      (err) => {
        if (err) {
          console.error('Fehler beim Aktualisieren der Schema-Version:', err);
        } else {
          console.log(`✅ Schema-Version aktualisiert auf: ${DB_SCHEMA_VERSION}`);
        }
        resolve();
      }
    );
  });
}

function initializeDatabase() {
  dbWrapper.connection.serialize(() => {
    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS kunden (
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

    // Migration: Neue Kundenfelder hinzufügen
    dbWrapper.connection.run(`ALTER TABLE kunden ADD COLUMN kennzeichen TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kennzeichen:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE kunden ADD COLUMN vin TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von vin:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE kunden ADD COLUMN fahrzeugtyp TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von fahrzeugtyp:', err);
      }
    });

    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS termine (
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

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN kunde_name TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kunde_name:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN kunde_telefon TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kunde_telefon:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN abholung_typ TEXT DEFAULT 'abholung'`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von abholung_typ:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN abholung_details TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von abholung_details:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN abholung_zeit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von abholung_zeit:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN bring_zeit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von bring_zeit:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN kontakt_option TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kontakt_option:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN kilometerstand INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von kilometerstand:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN ersatzauto INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von ersatzauto:', err);
      }
    });

    // Ersatzauto-Dauer in Tagen
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN ersatzauto_tage INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von ersatzauto_tage:', err);
      }
    });

    // Ersatzauto bis Datum (Rückgabe-Datum)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN ersatzauto_bis_datum DATE`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von ersatzauto_bis_datum:', err);
      }
    });

    // Ersatzauto Rückgabe-Uhrzeit
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN ersatzauto_bis_zeit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von ersatzauto_bis_zeit:', err);
      }
    });

    // Abhol-Datum (falls anderer Tag als Termin)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN abholung_datum DATE`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von abholung_datum:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN termin_nr TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von termin_nr:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN arbeitszeiten_details TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von arbeitszeiten_details:', err);
      }
    });

    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN mitarbeiter_id INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von mitarbeiter_id:', err);
      }
    });

    // Papierkorb: geloescht_am Feld für Soft-Delete
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN geloescht_am DATETIME`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von geloescht_am:', err);
      }
    });

    // Dringlichkeit für interne Termine
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN dringlichkeit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von dringlichkeit:', err);
      }
    });

    // VIN/VIS (Fahrzeug-Identifizierungsnummer)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN vin TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von vin:', err);
      }
    });

    // Fahrzeugtyp
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN fahrzeugtyp TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von fahrzeugtyp:', err);
      }
    });

    // Schwebender Termin (noch nicht fest eingeplant, wird nicht in Auslastung gezählt)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN ist_schwebend INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von ist_schwebend:', err);
      }
    });

    // Priorität für schwebende Termine (hoch, mittel, niedrig)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN schwebend_prioritaet TEXT DEFAULT 'mittel'`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von schwebend_prioritaet:', err);
      }
    });

    // Parent-Termin-ID für gesplittete Termine (verweist auf ursprünglichen Termin)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN parent_termin_id INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von parent_termin_id:', err);
      }
    });

    // Split-Teil-Nummer (1 = erster Teil, 2 = zweiter Teil, etc.)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN split_teil INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von split_teil:', err);
      }
    });

    // Bearbeitungs-Markierung (muss noch bearbeitet werden / Eingaben fehlen)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN muss_bearbeitet_werden INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von muss_bearbeitet_werden:', err);
      }
    });

    // Erweiterungs-Felder für Auftragserweiterung
    // Referenz zum Original-Termin bei Erweiterungen
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN erweiterung_von_id INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von erweiterung_von_id:', err);
      }
    });

    // Flag ob Termin eine Erweiterung ist (0=normal, 1=erweiterung)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN ist_erweiterung INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von ist_erweiterung:', err);
      }
    });

    // Typ der Erweiterung ('anschluss', 'morgen', 'datum')
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN erweiterung_typ TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von erweiterung_typ:', err);
      }
    });

    // Teile-Status für Erweiterungen
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN teile_status TEXT DEFAULT 'vorraetig'`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von teile_status:', err);
      }
    });

    // Interne Auftragsnummer
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN interne_auftragsnummer TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von interne_auftragsnummer:', err);
      }
    });

    // Startzeit (berechnete/tatsächliche Startzeit des Termins)
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN startzeit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von startzeit:', err);
      }
    });

    // Berechnete Endzeit des Termins
    dbWrapper.connection.run(`ALTER TABLE termine ADD COLUMN endzeit_berechnet TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von endzeit_berechnet:', err);
      }
    });

    // Mitarbeiter-Tabelle
    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS mitarbeiter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      arbeitsstunden_pro_tag INTEGER DEFAULT 8,
      nebenzeit_prozent REAL DEFAULT 0,
      aktiv INTEGER DEFAULT 1,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migration: ordnungszeit_prozent zu nebenzeit_prozent umbenennen (falls vorhanden)
    dbWrapper.connection.run(`ALTER TABLE mitarbeiter ADD COLUMN nebenzeit_prozent REAL DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        // Wenn Spalte nicht existiert, versuche Migration von alter Spalte
        db.all("PRAGMA table_info(mitarbeiter)", (err, columns) => {
          if (!err && columns) {
            const hasOrdnungszeit = columns.some(c => c.name === 'ordnungszeit_prozent');
            const hasNebenzeit = columns.some(c => c.name === 'nebenzeit_prozent');
            if (hasOrdnungszeit && !hasNebenzeit) {
              // Kopiere Daten von ordnungszeit_prozent zu nebenzeit_prozent
              dbWrapper.connection.run(`UPDATE mitarbeiter SET nebenzeit_prozent = ordnungszeit_prozent WHERE nebenzeit_prozent = 0`, (err) => {
                if (err) console.error('Fehler bei Migration ordnungszeit_prozent:', err);
              });
            }
          }
        });
      }
    });

    // Spalte nur_service hinzufügen (wenn Mitarbeiter nur Service macht, keine Werkstattaufgaben)
    dbWrapper.connection.run(`ALTER TABLE mitarbeiter ADD COLUMN nur_service INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von nur_service:', err);
      }
    });

    // Mittagspause-Startzeit für jeden Mitarbeiter (z.B. '12:00')
    dbWrapper.connection.run(`ALTER TABLE mitarbeiter ADD COLUMN mittagspause_start TEXT DEFAULT '12:00'`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von mittagspause_start:', err);
      }
    });

    // Lehrlinge-Tabelle
    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS lehrlinge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nebenzeit_prozent REAL DEFAULT 0,
      aufgabenbewaeltigung_prozent REAL DEFAULT 100,
      aktiv INTEGER DEFAULT 1,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migration: ordnungszeit_prozent zu nebenzeit_prozent umbenennen (falls vorhanden)
    dbWrapper.connection.run(`ALTER TABLE lehrlinge ADD COLUMN nebenzeit_prozent REAL DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        // Wenn Spalte nicht existiert, versuche Migration von alter Spalte
        db.all("PRAGMA table_info(lehrlinge)", (err, columns) => {
          if (!err && columns) {
            const hasOrdnungszeit = columns.some(c => c.name === 'ordnungszeit_prozent');
            const hasNebenzeit = columns.some(c => c.name === 'nebenzeit_prozent');
            if (hasOrdnungszeit && !hasNebenzeit) {
              // Kopiere Daten von ordnungszeit_prozent zu nebenzeit_prozent
              dbWrapper.connection.run(`UPDATE lehrlinge SET nebenzeit_prozent = ordnungszeit_prozent WHERE nebenzeit_prozent = 0`, (err) => {
                if (err) console.error('Fehler bei Migration ordnungszeit_prozent:', err);
              });
            }
          }
        });
      }
    });

    // Arbeitsstunden pro Tag für Lehrlinge hinzufügen
    dbWrapper.connection.run(`ALTER TABLE lehrlinge ADD COLUMN arbeitsstunden_pro_tag INTEGER DEFAULT 8`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von arbeitsstunden_pro_tag:', err);
      }
    });

    // Mittagspause-Startzeit für Lehrlinge (z.B. '12:00')
    dbWrapper.connection.run(`ALTER TABLE lehrlinge ADD COLUMN mittagspause_start TEXT DEFAULT '12:00'`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von mittagspause_start:', err);
      }
    });

    // Berufsschul-Wochen für Lehrlinge (komma-getrennte KW-Nummern, z.B. "2,4,6,8,10") (V1.1.1)
    dbWrapper.connection.run(`ALTER TABLE lehrlinge ADD COLUMN berufsschul_wochen TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von berufsschul_wochen:', err);
      }
    });

    // Foreign Key für mitarbeiter_id (SQLite unterstützt keine ALTER TABLE ADD CONSTRAINT, daher nur Index)
    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_termine_mitarbeiter_id ON termine(mitarbeiter_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_mitarbeiter_id:', err);
    });

    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS arbeitszeiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bezeichnung TEXT NOT NULL,
      standard_minuten INTEGER NOT NULL,
      aliase TEXT DEFAULT ''
    )`);

    // Füge aliase Spalte hinzu falls sie nicht existiert (für bestehende Datenbanken)
    dbWrapper.connection.run(`ALTER TABLE arbeitszeiten ADD COLUMN aliase TEXT DEFAULT ''`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von aliase:', err);
      }
    });

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

    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS werkstatt_einstellungen (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mitarbeiter_anzahl INTEGER DEFAULT 1,
      arbeitsstunden_pro_tag INTEGER DEFAULT 8,
      pufferzeit_minuten INTEGER DEFAULT 15
    )`);

    dbWrapper.connection.run(
      `INSERT OR IGNORE INTO werkstatt_einstellungen (id, mitarbeiter_anzahl, arbeitsstunden_pro_tag, pufferzeit_minuten)
       VALUES (1, 1, 8, 15)`
    );

    // Füge Pufferzeit-Spalte hinzu falls sie nicht existiert
    dbWrapper.connection.run(`ALTER TABLE werkstatt_einstellungen ADD COLUMN pufferzeit_minuten INTEGER DEFAULT 15`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von pufferzeit_minuten:', err);
      }
    });

    // Füge Servicezeit-Spalte hinzu falls sie nicht existiert
    dbWrapper.connection.run(`ALTER TABLE werkstatt_einstellungen ADD COLUMN servicezeit_minuten INTEGER DEFAULT 10`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von servicezeit_minuten:', err);
      }
    });

    // Füge Ersatzauto-Anzahl Spalte hinzu falls sie nicht existiert
    dbWrapper.connection.run(`ALTER TABLE werkstatt_einstellungen ADD COLUMN ersatzauto_anzahl INTEGER DEFAULT 2`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von ersatzauto_anzahl:', err);
      }
    });

    // Füge Nebenzeit-Prozent Spalte hinzu falls sie nicht existiert (globale Einstellung)
    dbWrapper.connection.run(`ALTER TABLE werkstatt_einstellungen ADD COLUMN nebenzeit_prozent REAL DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von nebenzeit_prozent:', err);
      }
    });

    // Füge Mittagspause-Dauer Spalte hinzu (in Minuten, global für alle)
    dbWrapper.connection.run(`ALTER TABLE werkstatt_einstellungen ADD COLUMN mittagspause_minuten INTEGER DEFAULT 30`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von mittagspause_minuten:', err);
      }
    });

    // Ersatzautos-Tabelle
    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS ersatzautos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kennzeichen TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      typ TEXT,
      aktiv INTEGER DEFAULT 1,
      manuell_gesperrt INTEGER DEFAULT 0,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('Fehler beim Erstellen der ersatzautos Tabelle:', err);
      }
    });

    // Migration: manuell_gesperrt Feld hinzufügen
    dbWrapper.connection.run(`ALTER TABLE ersatzautos ADD COLUMN manuell_gesperrt INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von manuell_gesperrt:', err);
      }
    });

    // Migration: gesperrt_bis Feld für zeitbasierte Sperrung hinzufügen
    dbWrapper.connection.run(`ALTER TABLE ersatzautos ADD COLUMN gesperrt_bis TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von gesperrt_bis:', err);
      }
    });

    // Migration: sperrgrund Feld für Sperrgrund hinzufügen (V1.1.1)
    dbWrapper.connection.run(`ALTER TABLE ersatzautos ADD COLUMN sperrgrund TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von sperrgrund:', err);
      }
    });

    // Migration: gesperrt_seit Feld für Sperrdatum hinzufügen (V1.1.1)
    dbWrapper.connection.run(`ALTER TABLE ersatzautos ADD COLUMN gesperrt_seit TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen von gesperrt_seit:', err);
      }
    });

    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS abwesenheiten (
      datum TEXT PRIMARY KEY,
      urlaub INTEGER DEFAULT 0,
      krank INTEGER DEFAULT 0
    )`);

    // Neue Tabelle für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS mitarbeiter_abwesenheiten (
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
    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_ma_abw_mitarbeiter ON mitarbeiter_abwesenheiten(mitarbeiter_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_ma_abw_mitarbeiter:', err);
    });

    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_ma_abw_lehrling ON mitarbeiter_abwesenheiten(lehrling_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_ma_abw_lehrling:', err);
    });

    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_ma_abw_datum ON mitarbeiter_abwesenheiten(von_datum, bis_datum)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_ma_abw_datum:', err);
    });

    // Erstelle Indizes für bessere Performance
    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_termine_datum ON termine(datum)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_datum:', err);
    });

    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_termine_status ON termine(status)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_status:', err);
    });

    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_termine_kunde_id ON termine(kunde_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_kunde_id:', err);
    });

    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_termine_datum_status ON termine(datum, status)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_datum_status:', err);
    });

    // Termin-Phasen für mehrtägige Arbeiten (z.B. Unfallreparatur)
    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS termin_phasen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id INTEGER NOT NULL,
      phase_nr INTEGER NOT NULL,
      bezeichnung TEXT NOT NULL,
      datum DATE NOT NULL,
      geschaetzte_zeit INTEGER NOT NULL,
      tatsaechliche_zeit INTEGER,
      mitarbeiter_id INTEGER,
      lehrling_id INTEGER,
      status TEXT DEFAULT 'geplant',
      notizen TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE CASCADE,
      FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id),
      FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id)
    )`, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Fehler beim Erstellen der termin_phasen Tabelle:', err);
      }
    });

    // Indizes für termin_phasen
    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_phasen_termin ON termin_phasen(termin_id)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_phasen_termin:', err);
    });

    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_phasen_datum ON termin_phasen(datum)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_phasen_datum:', err);
    });

    // Weitere Performance-Indizes
    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_kunden_name ON kunden(name)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_kunden_name:', err);
    });

    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_kunden_kennzeichen ON kunden(kennzeichen)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_kunden_kennzeichen:', err);
    });

    dbWrapper.connection.run(`CREATE INDEX IF NOT EXISTS idx_termine_geloescht_am ON termine(geloescht_am)`, (err) => {
      if (err) console.error('Fehler beim Erstellen des Index idx_termine_geloescht_am:', err);
    });
  });
}

// Initialisierung mit automatischem Backup
async function initializeDatabaseWithBackup() {
  try {
    // 1. Schema-Version prüfen
    const { needsMigration, oldVersion } = await checkAndUpdateSchemaVersion();

    // 2. Bei nötiger Migration: Backup erstellen
    if (needsMigration) {
      console.log('🔄 Migration erkannt - erstelle Sicherheits-Backup...');
      await createAutoBackup();
    }

    // 3. Normale Initialisierung (enthält Migrationen)
    initializeDatabase();

    // 4. Schema-Version aktualisieren (nach kurzer Verzögerung für async DB-Operationen)
    setTimeout(async () => {
      await updateSchemaVersion();
    }, 1000);

    console.log('✅ Datenbank-Initialisierung abgeschlossen');
  } catch (error) {
    console.error('❌ Fehler bei Datenbank-Initialisierung:', error);
    // Trotzdem normale Init versuchen
    initializeDatabase();
  }
}

module.exports = { 
  db, 
  getDb, 
  initializeDatabase, 
  initializeDatabaseWithBackup,
  createAutoBackup,
  reconnectDatabase, 
  dbPath, 
  dataDir,
  DB_SCHEMA_VERSION
};
