const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

// Migration-Runner importieren
const { runMigrations, getLatestVersion, hasPendingMigrations } = require('../../migrations');

// Schema-Kompatibilitäts-Modul importieren
const { ensureSchemaCompatibility } = require('./schemaCompatibility');

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
    
    // Überspringe node_modules/electron/dist (Development-Modus)
    if (!exeDir.includes('node_modules')) {
      if (fs.existsSync(resourcesDir)) {
        console.log('Electron gepackte App erkannt (exe+resources), EXE-Verzeichnis:', exeDir);
        return exeDir;
      }
    }
  }

  // 4. Linux-Produktionspfad: /var/lib/werkstatt-terminplaner (Standard bei systemd-Installation)
  // Schutz: Wenn eine bestehende Produktionsdatenbank gefunden wird, IMMER diesen Pfad nutzen
  // (verhindert versehentliches Erstellen einer leeren Datenbank beim manuellen Neustart)
  const linuxProdPath = '/var/lib/werkstatt-terminplaner';
  const linuxProdDb = path.join(linuxProdPath, 'database', 'werkstatt.db');
  if (process.platform === 'linux' && fs.existsSync(linuxProdDb)) {
    console.log('⚠️  Kein DATA_DIR gesetzt – Linux-Produktion erkannt, verwende:', linuxProdPath);
    console.log('💡 Tipp: Setze DATA_DIR=' + linuxProdPath + ' in der systemd-Unit oder .env');
    return linuxProdPath;
  }

  // 5. Standard: Arbeitsverzeichnis (für Entwicklungsmodus)
  // SICHERHEITSCHECK: Wenn wir auf Linux sind und kein DATA_DIR gesetzt ist und kein Prod-Pfad
  // existiert, warnen wir laut – könnte ein versehentlicher manueller Start sein
  if (process.platform === 'linux' && process.env.NODE_ENV === 'production') {
    console.error('');
    console.error('❌ KRITISCHER FEHLER: Server läuft im Produktionsmodus (NODE_ENV=production)');
    console.error('   aber weder DATA_DIR noch die Standarddatenbank wurden gefunden!');
    console.error('   Pfad geprüft: ' + linuxProdDb);
    console.error('   Um eine leere Datenbank zu verhindern, wird der Server NICHT gestartet.');
    console.error('');
    console.error('   Lösung: systemctl restart werkstatt-terminplaner');
    console.error('   ODER:   DATA_DIR=/var/lib/werkstatt-terminplaner node src/server.js');
    console.error('');
    process.exit(1);
  }

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
  connection: null,
  ready: false,
  readyPromise: null
};

// Proxy für abwärtskompatiblen Zugriff auf db-Methoden
// WICHTIG: Proxy SOFORT erstellen, BEVOR wir die Connection herstellen
const db = new Proxy({}, {
  get(target, prop) {
    // Spezialfall: Wenn connection selbst abgefragt wird
    if (prop === '_connection') {
      return dbWrapper.connection;
    }
    
    // Prüfe ob Connection existiert
    if (!dbWrapper.connection) {
      const errorMsg = `❌ Datenbank-Zugriff auf '${prop}' fehlgeschlagen: Connection ist noch nicht bereit. Race-Condition: Code versucht DB-Zugriff bevor initializeDatabaseWithBackup() abgeschlossen ist.`;
      console.error(errorMsg);
      console.error('💡 Tipp: Stelle sicher, dass Routes erst NACH dbWrapper.readyPromise geladen werden.');
      const error = new Error('Datenbankverbindung noch nicht bereit - bitte auf readyPromise warten');
      error.code = 'DB_NOT_READY';
      throw error;
    }

    // Alle anderen Props/Methoden vom aktuellen Connection-Objekt holen
    const value = dbWrapper.connection[prop];
    if (typeof value === 'function') {
      return value.bind(dbWrapper.connection);
    }
    return value;
  }
});

// Promise für Connection-Bereitschaft - NACH Proxy-Erstellung
dbWrapper.readyPromise = new Promise((resolve, reject) => {
  // Initiale Verbindung herstellen
  const dbInstance = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Fehler beim Öffnen der Datenbank:', err);
      reject(err);
    } else {
      console.log('Datenbank verbunden:', dbPath);
      
      // =========================================================================
      // Performance-Optimierungen für Linux Multi-Client-Zugriff
      // =========================================================================
      console.log('🔧 Aktiviere SQLite-Optimierungen...');
      
      // WAL-Modus für bessere Concurrency (Leser blockieren nicht Schreiber)
      dbInstance.run('PRAGMA journal_mode = WAL;', (err) => {
        if (err) console.warn('⚠️ WAL-Modus konnte nicht aktiviert werden:', err.message);
        else console.log('  ✓ WAL-Modus aktiviert (Write-Ahead Logging)');
      });
      
      // Synchronisierung reduzieren (NORMAL ist guter Kompromiss zwischen Speed und Sicherheit)
      dbInstance.run('PRAGMA synchronous = NORMAL;', (err) => {
        if (err) console.warn('⚠️ synchronous konnte nicht gesetzt werden:', err.message);
        else console.log('  ✓ Synchronous = NORMAL (optimiert für Performance)');
      });
      
      // Busy-Timeout erhöhen (wichtig für Multi-Client: warte bis zu 5 Sekunden wenn DB gesperrt)
      dbInstance.run('PRAGMA busy_timeout = 5000;', (err) => {
        if (err) console.warn('⚠️ busy_timeout konnte nicht gesetzt werden:', err.message);
        else console.log('  ✓ Busy-Timeout = 5000ms (bessere Concurrency)');
      });
      
      // Cache-Größe erhöhen (Standard: 2MB, neu: 32MB = bessere Read-Performance)
      dbInstance.run('PRAGMA cache_size = -32000;', (err) => {
        if (err) console.warn('⚠️ cache_size konnte nicht gesetzt werden:', err.message);
        else console.log('  ✓ Cache-Size = 32MB (schnellere Queries)');
      });
      
      // Temporäre Daten im RAM (schneller als Disk-I/O)
      dbInstance.run('PRAGMA temp_store = MEMORY;', (err) => {
        if (err) console.warn('⚠️ temp_store konnte nicht gesetzt werden:', err.message);
        else console.log('  ✓ Temp-Store = MEMORY (schnellere Sorts/Joins)');
      });
      
      // Memory-Mapped I/O für schnellere Lesezugriffe (128MB)
      // Gut für Linux-Server mit genügend RAM
      dbInstance.run('PRAGMA mmap_size = 134217728;', (err) => {
        if (err) console.warn('⚠️ mmap_size konnte nicht gesetzt werden:', err.message);
        else console.log('  ✓ Memory-Mapped I/O = 128MB (schnellere Reads)');
      });
      
      // WAL Auto-Checkpoint optimieren (1000 Seiten statt 1000)
      dbInstance.run('PRAGMA wal_autocheckpoint = 1000;', (err) => {
        if (err) console.warn('⚠️ wal_autocheckpoint konnte nicht gesetzt werden:', err.message);
        else console.log('  ✓ WAL Auto-Checkpoint = 1000 Seiten');
      });
      
      // Foreign Keys aktivieren (Datenintegrität)
      dbInstance.run('PRAGMA foreign_keys = ON;', (err) => {
        if (err) console.warn('⚠️ foreign_keys konnte nicht aktiviert werden:', err.message);
        else console.log('  ✓ Foreign Keys aktiviert');
      });
      
      console.log('✅ SQLite-Optimierungen abgeschlossen');
      
      // JETZT erst Connection setzen - nachdem der Callback ausgeführt wurde
      dbWrapper.connection = dbInstance;
      dbWrapper.ready = true;
      resolve();
    }
  });
});

// Funktion zum Neuladen der Datenbank-Verbindung (nach Backup-Restore)
function reconnectDatabase() {
  return new Promise((resolve, reject) => {
    const openNewConnection = () => {
      console.log('🔄 Öffne neue Datenbankverbindung...');
      const newDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Fehler beim Öffnen der Datenbank:', err);
          reject(err);
        } else {
          dbWrapper.connection = newDb;
          dbWrapper.ready = true;
          console.log('✅ Datenbank neu verbunden:', dbPath);
          
          // Performance-Optimierungen (gleiche wie bei initialer Connection)
          console.log('🔧 Reaktiviere SQLite-Optimierungen...');
          newDb.run('PRAGMA journal_mode = WAL;');
          newDb.run('PRAGMA synchronous = NORMAL;');
          newDb.run('PRAGMA busy_timeout = 5000;');
          newDb.run('PRAGMA cache_size = -32000;');
          newDb.run('PRAGMA temp_store = MEMORY;');
          newDb.run('PRAGMA mmap_size = 134217728;');
          newDb.run('PRAGMA wal_autocheckpoint = 1000;');
          newDb.run('PRAGMA foreign_keys = ON;');
          console.log('✅ SQLite-Optimierungen reaktiviert');
          
          resolve(newDb);
        }
      });
    };

    // Falls Connection null ist, direkt neue öffnen
    if (!dbWrapper.connection) {
      console.log('🔄 Keine bestehende Verbindung - öffne neue...');
      openNewConnection();
      return;
    }

    console.log('🔄 Schließe alte Datenbankverbindung...');
    dbWrapper.connection.close((closeErr) => {
      if (closeErr) {
        console.error('Fehler beim Schließen der alten Verbindung:', closeErr);
        // Trotzdem fortfahren
      }
      dbWrapper.connection = null;
      dbWrapper.ready = false;
      openNewConnection();
    });
  });
}

// Funktion zum Schließen der Datenbank-Verbindung (ohne neue zu öffnen)
// Wird vor Datei-Restore verwendet damit kein File-Handle offen ist
function closeDatabase() {
  return new Promise((resolve) => {
    if (!dbWrapper.connection) {
      console.log('🔄 Keine Verbindung zum Schließen vorhanden');
      return resolve();
    }
    
    console.log('🔄 Schließe Datenbankverbindung...');
    dbWrapper.connection.close((err) => {
      if (err) {
        console.error('Fehler beim Schließen der Verbindung:', err);
      } else {
        console.log('✅ Datenbankverbindung geschlossen');
      }
      dbWrapper.connection = null;
      dbWrapper.ready = false;
      resolve();
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

      // Backup-Dateiname mit Zeitstempel (lokale Zeit, nicht UTC)
      const now = new Date();
      const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        'T',
        String(now.getHours()).padStart(2, '0'),
        '-',
        String(now.getMinutes()).padStart(2, '0'),
        '-',
        String(now.getSeconds()).padStart(2, '0')
      ].join('');
      const backupFileName = `werkstatt_backup_${timestamp}.db`;
      const backupPath = path.join(backupDir, backupFileName);

      // WAL-Checkpoint durchführen damit alle Daten in der Hauptdatei sind
      // Dann Backup erstellen
      const performBackup = () => {
        try {
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
        } catch (copyErr) {
          console.error('⚠️ Fehler beim Kopieren des Backups:', copyErr);
          resolve(false);
        }
      };

      // Checkpoint versuchen, dann Backup erstellen
      if (dbWrapper.connection) {
        dbWrapper.connection.run('PRAGMA wal_checkpoint(TRUNCATE);', (err) => {
          if (err) console.warn('⚠️ WAL-Checkpoint fehlgeschlagen:', err.message);
          else console.log('✅ WAL-Checkpoint vor Backup durchgeführt');
          performBackup();
        });
      } else {
        performBackup();
      }
    } catch (error) {
      console.error('⚠️ Fehler beim Erstellen des Backups:', error);
      resolve(false);
    }
  });
}

/**
 * Migration-Lock: Verhindert parallele Migration-Ausführung
 */
const migrationLock = {
  locked: false,
  lockedBy: null,
  lockedAt: null,
  
  async acquire() {
    return new Promise((resolve, reject) => {
      // Prüfe lokalen Lock-Status (für selben Prozess)
      if (this.locked) {
        const error = new Error(`Migration bereits im Gange (gestartet: ${this.lockedAt})`);
        error.code = 'MIGRATION_LOCKED';
        return reject(error);
      }
      
      // Erstelle Lock-Tabelle
      dbWrapper.connection.run(`
        CREATE TABLE IF NOT EXISTS _migration_lock (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          locked_at DATETIME,
          process_id INTEGER,
          hostname TEXT
        )
      `, (err) => {
        if (err) return reject(err);
        
        const pid = process.pid;
        const hostname = os.hostname();
        const now = new Date().toISOString();
        
        // Prüfe auf Stale Locks (> 30 Minuten)
        dbWrapper.connection.get('SELECT * FROM _migration_lock WHERE id = 1', (err, row) => {
          if (err) return reject(err);
          
          if (row) {
            const lockedAt = new Date(row.locked_at);
            const ageMinutes = (Date.now() - lockedAt.getTime()) / 1000 / 60;
            
            if (ageMinutes > 30) {
              console.warn(`⚠️ Stale Migration-Lock erkannt (${ageMinutes.toFixed(1)} Min alt) - wird freigegeben`);
              // Lösche Stale Lock
              dbWrapper.connection.run('DELETE FROM _migration_lock WHERE id = 1', (err) => {
                if (err) return reject(err);
                this.insertLock(now, pid, hostname, resolve, reject);
              });
            } else {
              const error = new Error(`Migration bereits im Gange auf ${row.hostname} (PID: ${row.process_id}, seit ${ageMinutes.toFixed(1)} Min)`);
              error.code = 'MIGRATION_LOCKED';
              return reject(error);
            }
          } else {
            this.insertLock(now, pid, hostname, resolve, reject);
          }
        });
      });
    });
  },
  
  insertLock(now, pid, hostname, resolve, reject) {
    dbWrapper.connection.run(
      'INSERT INTO _migration_lock (id, locked_at, process_id, hostname) VALUES (1, ?, ?, ?)',
      [now, pid, hostname],
      (err) => {
        if (err) return reject(err);
        
        this.locked = true;
        this.lockedBy = `${hostname}:${pid}`;
        this.lockedAt = now;
        
        console.log(`🔒 Migration-Lock erworben: ${this.lockedBy}`);
        resolve();
      }
    );
  },
  
  async release() {
    return new Promise((resolve) => {
      if (!this.locked) {
        return resolve();
      }
      
      dbWrapper.connection.run('DELETE FROM _migration_lock WHERE id = 1', (err) => {
        if (err) {
          console.error('⚠️ Fehler beim Freigeben des Migration-Locks:', err);
        } else {
          console.log(`🔓 Migration-Lock freigegeben: ${this.lockedBy}`);
        }
        
        this.locked = false;
        this.lockedBy = null;
        this.lockedAt = null;
        resolve();
      });
    });
  }
};

/**
 * Pre-Migration-Checks: Validiert Voraussetzungen vor Migration
 */
async function validateMigrationPreConditions() {
  const checks = [];
  const errors = [];
  
  console.log('🔍 Pre-Migration-Checks...');
  
  // Check 1: Freier Speicherplatz (mindestens 1 GB)
  try {
    const stats = fs.statSync(dbPath);
    const dbSizeMB = stats.size / 1024 / 1024;
    const requiredFreeMB = Math.max(1024, dbSizeMB * 3); // Mindestens 1GB oder 3x DB-Größe
    
    // Prüfe freien Speicher im DB-Verzeichnis
    const diskSpace = await checkDiskSpace(dbDir);
    const freeMB = diskSpace.free / 1024 / 1024;
    
    if (freeMB < requiredFreeMB) {
      errors.push(`Unzureichender Speicherplatz: ${freeMB.toFixed(0)} MB frei, ${requiredFreeMB.toFixed(0)} MB benötigt`);
      checks.push({ name: 'Speicherplatz', status: 'FAIL', detail: `${freeMB.toFixed(0)} MB / ${requiredFreeMB.toFixed(0)} MB` });
    } else {
      checks.push({ name: 'Speicherplatz', status: 'OK', detail: `${freeMB.toFixed(0)} MB frei` });
    }
  } catch (error) {
    console.warn('⚠️ Konnte Speicherplatz nicht prüfen:', error.message);
    checks.push({ name: 'Speicherplatz', status: 'SKIP', detail: 'Prüfung fehlgeschlagen' });
  }
  
  // Check 2: Gültiges Backup vorhanden
  try {
    const backupDir = path.join(dataDir, 'backups');
    if (fs.existsSync(backupDir)) {
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('werkstatt_backup_') && f.endsWith('.db'))
        .sort()
        .reverse();
      
      if (backupFiles.length === 0) {
        console.warn('⚠️ Kein Backup vorhanden - wird vor Migration erstellt');
        checks.push({ name: 'Backup vorhanden', status: 'WARN', detail: 'Keins gefunden (wird erstellt)' });
      } else {
        const newestBackup = backupFiles[0];
        const backupPath = path.join(backupDir, newestBackup);
        const backupStats = fs.statSync(backupPath);
        const ageMinutes = (Date.now() - backupStats.mtimeMs) / 1000 / 60;
        
        checks.push({ name: 'Backup vorhanden', status: 'OK', detail: `${newestBackup} (${ageMinutes.toFixed(0)} Min alt)` });
      }
    } else {
      checks.push({ name: 'Backup vorhanden', status: 'WARN', detail: 'Backup-Verzeichnis fehlt (wird erstellt)' });
    }
  } catch (error) {
    console.warn('⚠️ Konnte Backups nicht prüfen:', error.message);
    checks.push({ name: 'Backup vorhanden', status: 'SKIP', detail: 'Prüfung fehlgeschlagen' });
  }
  
  // Check 3: Datenbank nicht im Read-Only-Modus
  try {
    await new Promise((resolve, reject) => {
      dbWrapper.connection.run('CREATE TABLE IF NOT EXISTS _migration_check_temp (id INTEGER)', (err) => {
        if (err) {
          if (err.message.includes('readonly') || err.message.includes('read-only')) {
            errors.push('Datenbank ist im Read-Only-Modus');
            checks.push({ name: 'Schreibzugriff', status: 'FAIL', detail: 'Read-Only-Modus' });
            return reject(err);
          }
          return reject(err);
        }
        
        dbWrapper.connection.run('DROP TABLE IF EXISTS _migration_check_temp', (err) => {
          if (err) return reject(err);
          checks.push({ name: 'Schreibzugriff', status: 'OK', detail: 'Test-Write erfolgreich' });
          resolve();
        });
      });
    });
  } catch (error) {
    if (!errors.find(e => e.includes('Read-Only'))) {
      console.warn('⚠️ Konnte Schreibzugriff nicht prüfen:', error.message);
      checks.push({ name: 'Schreibzugriff', status: 'SKIP', detail: 'Prüfung fehlgeschlagen' });
    }
  }
  
  // Check 4: Keine offenen Transaktionen (SQLite-spezifisch schwierig zu prüfen)
  // SQLite hat kein einfaches "SHOW TRANSACTION" - wir loggen nur eine Warnung
  checks.push({ name: 'Offene Transaktionen', status: 'SKIP', detail: 'Nicht prüfbar (SQLite)' });
  
  // Ausgabe der Checks
  console.log('📋 Pre-Migration-Check Ergebnisse:');
  checks.forEach(check => {
    const icon = check.status === 'OK' ? '✅' : check.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`  ${icon} ${check.name}: ${check.detail}`);
  });
  
  // Bei Fehlern: Exception werfen
  if (errors.length > 0) {
    const error = new Error(`Pre-Migration-Checks fehlgeschlagen:\n  - ${errors.join('\n  - ')}`);
    error.code = 'PRE_CHECK_FAILED';
    error.checks = checks;
    throw error;
  }
  
  return checks;
}

/**
 * Disk-Space-Check (plattformunabhängig)
 */
function checkDiskSpace(dirPath) {
  return new Promise((resolve) => {
    // Fallback-Werte falls Prüfung fehlschlägt
    const fallback = { free: 10 * 1024 * 1024 * 1024, total: 100 * 1024 * 1024 * 1024 };
    
    try {
      // Auf macOS/Linux: df
      if (process.platform !== 'win32') {
        const { execSync } = require('child_process');
        const output = execSync(`df -k "${dirPath}"`, { encoding: 'utf8' });
        const lines = output.trim().split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          const available = parseInt(parts[3]) * 1024; // df gibt KB zurück
          const total = parseInt(parts[1]) * 1024;
          resolve({ free: available, total });
          return;
        }
      }
      
      // Auf Windows: wmic (komplexer, vorerst Fallback)
      resolve(fallback);
    } catch (error) {
      console.warn('⚠️ Disk-Space-Check fehlgeschlagen:', error.message);
      resolve(fallback);
    }
  });
}

/**
 * Schema-Checksum: Berechnet Hash der Datenbank-Struktur
 */
async function calculateSchemaChecksum() {
  return new Promise((resolve, reject) => {
    // Alle Tabellen und ihre Definitionen abfragen
    dbWrapper.connection.all(
      `SELECT name, sql FROM sqlite_master 
       WHERE type IN ('table', 'index', 'view') 
       AND name NOT LIKE 'sqlite_%' 
       AND name NOT LIKE '_migration_%'
       ORDER BY name`,
      (err, rows) => {
        if (err) return reject(err);
        
        // Konkateniere alle SQL-Statements
        const schemaString = rows
          .map(row => `${row.name}:${row.sql || ''}`)
          .join('|');
        
        // SHA256-Hash berechnen
        const hash = crypto.createHash('sha256')
          .update(schemaString)
          .digest('hex');
        
        resolve(hash);
      }
    );
  });
}

/**
 * Schema-Checksum speichern
 */
async function saveSchemaChecksum(checksum) {
  return new Promise((resolve, reject) => {
    dbWrapper.connection.run(
      `INSERT OR REPLACE INTO _schema_meta (key, value) VALUES ('schema_checksum', ?)`,
      [checksum],
      (err) => {
        if (err) return reject(err);
        console.log(`✅ Schema-Checksum gespeichert: ${checksum.substring(0, 16)}...`);
        resolve();
      }
    );
  });
}

/**
 * Schema-Integrität verifizieren
 */
async function verifySchemaIntegrity() {
  try {
    // Gespeicherte Checksum laden
    const storedChecksum = await new Promise((resolve) => {
      dbWrapper.connection.get(
        `SELECT value FROM _schema_meta WHERE key = 'schema_checksum'`,
        (err, row) => {
          if (err || !row) return resolve(null);
          resolve(row.value);
        }
      );
    });
    
    if (!storedChecksum) {
      console.log('ℹ️ Keine Schema-Checksum gespeichert - erstelle neue');
      const checksum = await calculateSchemaChecksum();
      await saveSchemaChecksum(checksum);
      return true;
    }
    
    // Aktuelle Checksum berechnen
    const currentChecksum = await calculateSchemaChecksum();
    
    if (currentChecksum !== storedChecksum) {
      console.warn('⚠️ Schema-Checksum-Mismatch erkannt!');
      console.warn(`  Gespeichert: ${storedChecksum.substring(0, 16)}...`);
      console.warn(`  Aktuell:     ${currentChecksum.substring(0, 16)}...`);
      console.warn('  Möglicherweise wurde das Schema außerhalb des Migrations-Systems geändert.');
      
      // Update Checksum auf aktuellen Stand
      await saveSchemaChecksum(currentChecksum);
      return false;
    }
    
    console.log(`✅ Schema-Integrität OK: ${currentChecksum.substring(0, 16)}...`);
    return true;
  } catch (error) {
    console.error('❌ Fehler bei Schema-Integritätsprüfung:', error);
    return false;
  }
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

    // 0. Warte auf Datenbank-Connection (wichtig für async sqlite3.Database)
    await dbWrapper.readyPromise;
    console.log('✅ Datenbank-Connection bereit');

    // 0.5 WICHTIG: Schema-Kompatibilität prüfen (alte _schema_meta → neue schema_migrations)
    const compatResult = await ensureSchemaCompatibility(dbWrapper.connection);
    if (compatResult.converted) {
      console.log(`✅ ${compatResult.message}`);
    }

    // 1. Schema-Version prüfen
    const currentVersion = await getSchemaVersion();
    const latestVersion = getLatestVersion();

    console.log(`📊 Schema-Version: ${currentVersion} → ${latestVersion}`);

    // 2. Schema-Integrität prüfen (nur wenn Datenbank existiert)
    if (currentVersion > 0) {
      await verifySchemaIntegrity();
    }

    // 3. Bei nötiger Migration: Pre-Checks und Lock
    if (hasPendingMigrations(currentVersion)) {
      console.log('🔄 Migration erkannt - führe Pre-Checks durch...');
      
      try {
        // Pre-Migration-Checks
        await validateMigrationPreConditions();
        
        // Migration-Lock erwerben
        await migrationLock.acquire();
        
        // Sicherheits-Backup erstellen
        console.log('💾 Erstelle Sicherheits-Backup...');
        await createAutoBackup();
        
        // Migrationen ausführen
        console.log('🚀 Starte Migrationen...');
        const newVersion = await runMigrations(dbWrapper.connection, currentVersion);
        
        // Schema-Version aktualisieren
        await setSchemaVersion(newVersion);
        
        // Neue Schema-Checksum speichern
        const newChecksum = await calculateSchemaChecksum();
        await saveSchemaChecksum(newChecksum);
        
        // Lock freigeben
        await migrationLock.release();
        
        console.log(`✅ Migrationen erfolgreich abgeschlossen: Version ${currentVersion} → ${newVersion}`);
        
      } catch (error) {
        // Bei Fehler: Lock freigeben
        await migrationLock.release();
        throw error;
      }
    } else {
      console.log('✅ Datenbank ist aktuell (keine Migrationen nötig)');
    }

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

// Helper-Funktion für explizites Warten auf DB-Bereitschaft
function waitForDb() {
  return dbWrapper.readyPromise;
}

module.exports = {
  db,
  dbWrapper,  // Exportiere dbWrapper damit andere Module auf readyPromise zugreifen können
  waitForDb,
  getDb,
  initializeDatabase,
  initializeDatabaseWithBackup,
  createAutoBackup,
  reconnectDatabase,
  closeDatabase,
  dbPath,
  dataDir,
  DB_SCHEMA_VERSION,
  // Neue Funktionen
  migrationLock,
  validateMigrationPreConditions,
  calculateSchemaChecksum,
  verifySchemaIntegrity,
  getSchemaVersion,
  setSchemaVersion
};
