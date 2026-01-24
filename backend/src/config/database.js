const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Migration-Runner importieren
const { runMigrations, getLatestVersion, hasPendingMigrations } = require('../../migrations');

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

// Schema-Version aus Datenbank auslesen
function getSchemaVersion() {
  return new Promise((resolve) => {
    // Meta-Tabelle erstellen falls nicht vorhanden
    dbWrapper.connection.run(`CREATE TABLE IF NOT EXISTS _schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )`, (err) => {
      if (err) {
        console.error('Fehler beim Erstellen der Meta-Tabelle:', err);
        resolve(0);
        return;
      }

      // Aktuelle Version auslesen
      dbWrapper.connection.get(`SELECT value FROM _schema_meta WHERE key = 'schema_version'`, (err, row) => {
        const currentVersion = row ? parseInt(row.value) : 0;
        resolve(currentVersion);
      });
    });
  });
}

// Schema-Version in Datenbank speichern
function setSchemaVersion(version) {
  return new Promise((resolve) => {
    dbWrapper.connection.run(
      `INSERT OR REPLACE INTO _schema_meta (key, value) VALUES ('schema_version', ?)`,
      [version.toString()],
      (err) => {
        if (err) {
          console.error('Fehler beim Aktualisieren der Schema-Version:', err);
        } else {
          console.log(`✅ Schema-Version aktualisiert auf: ${version}`);
        }
        resolve();
      }
    );
  });
}

// Hauptfunktion: Datenbank initialisieren mit Migrations-System
async function initializeDatabaseWithBackup() {
  try {
    console.log('🔧 Starte Datenbank-Initialisierung...');

    // 1. Schema-Version prüfen
    const currentVersion = await getSchemaVersion();
    const latestVersion = getLatestVersion();

    console.log(`📊 Schema-Version: ${currentVersion} → ${latestVersion}`);

    // 2. Bei nötiger Migration: Backup erstellen
    if (hasPendingMigrations(currentVersion)) {
      console.log('🔄 Migration erkannt - erstelle Sicherheits-Backup...');
      await createAutoBackup();
    }

    // 3. Migrationen ausführen
    const newVersion = await runMigrations(dbWrapper.connection, currentVersion);

    // 4. Schema-Version aktualisieren
    await setSchemaVersion(newVersion);

    console.log('✅ Datenbank-Initialisierung abgeschlossen');
  } catch (error) {
    console.error('❌ Fehler bei Datenbank-Initialisierung:', error);
    throw error;
  }
}

// Legacy-Funktion für Abwärtskompatibilität (ruft nur noch Migrations auf)
function initializeDatabase() {
  // Synchroner Wrapper - ruft async Version auf
  initializeDatabaseWithBackup().catch(err => {
    console.error('Fehler bei initializeDatabase:', err);
  });
}

// Schema-Version exportieren (basiert auf Migrations-Anzahl)
const DB_SCHEMA_VERSION = getLatestVersion();

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
