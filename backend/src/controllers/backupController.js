const fs = require('fs');
const path = require('path');
const { db, dbPath, dataDir, initializeDatabase, reconnectDatabase } = require('../config/database');

const backupDir = path.join(dataDir, 'backups');

// Hilfsfunktion: Prüfe ob DB aktuelle Daten hat
function checkDatabaseCurrency(callback) {
  if (!db || !db.connection) {
    return callback(new Error('Keine Datenbankverbindung'));
  }

  const heute = new Date().toISOString().split('T')[0];
  const vorWoche = new Date();
  vorWoche.setDate(vorWoche.getDate() - 7);
  const vorWocheStr = vorWoche.toISOString().split('T')[0];

  db.connection.all(
    `SELECT 
      COUNT(*) as total_termine,
      MAX(datum) as neuester_termin,
      MIN(datum) as aeltester_termin,
      SUM(CASE WHEN datum >= ? THEN 1 ELSE 0 END) as termine_letzte_woche
    FROM termine`,
    [vorWocheStr],
    (err, rows) => {
      if (err) return callback(err);
      
      const stats = rows[0];
      const neusterTermin = stats.neuester_termin ? new Date(stats.neuester_termin) : null;
      const alterInTagen = neusterTermin ? 
        Math.floor((new Date() - neusterTermin) / (1000 * 60 * 60 * 24)) : null;

      callback(null, {
        totalTermine: stats.total_termine,
        neusterTermin: stats.neuester_termin,
        aeltesterTermin: stats.aeltester_termin,
        termineLetzteSiebenTage: stats.termine_letzte_woche,
        alterInTagen,
        istVeraltet: alterInTagen !== null && alterInTagen > 7
      });
    }
  );
}

function ensureBackupDir() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

function mapBackupFiles() {
  ensureBackupDir();
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
  return files.map(file => {
    const full = path.join(backupDir, file);
    const stats = fs.statSync(full);
    
    // Versuche Datum aus Dateinamen zu extrahieren (werkstatt_backup_20260204T10-22-34.db)
    let createdAt = stats.birthtime; // Fallback: birthtime
    const match = file.match(/(\d{4})(\d{2})(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
    if (match) {
      // Datum aus Dateinamen parsen (ist in lokaler Zeit)
      const [, year, month, day, hour, minute, second] = match;
      createdAt = new Date(
        parseInt(year),
        parseInt(month) - 1, // Monat ist 0-basiert
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }
    
    return {
      name: file,
      sizeBytes: stats.size,
      createdAt: createdAt
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}

const BackupController = {
  status: (req, res) => {
    try {
      ensureBackupDir();
      const dbStats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
      const backups = mapBackupFiles();
      const lastBackup = backups[0] || null;

      // Prüfe DB-Aktualität
      checkDatabaseCurrency((err, currencyStats) => {
        const response = {
          dbPath,
          backupDir,
          dbSizeBytes: dbStats ? dbStats.size : 0,
          lastBackup,
          backupCount: backups.length
        };

        if (!err && currencyStats) {
          response.datenStatus = currencyStats;
          
          if (currencyStats.istVeraltet) {
            response.warnung = `⚠️ Die Datenbank enthält keine aktuellen Termine. Neuester Termin: ${currencyStats.neusterTermin} (vor ${currencyStats.alterInTagen} Tagen). Möglicherweise verwenden Sie eine Test-/Entwicklungs-DB.`;
          }
        }

        res.json(response);
      });
    } catch (error) {
      console.error('Backup Status Fehler:', error);
      res.status(500).json({ error: 'Backup-Status konnte nicht gelesen werden' });
    }
  },

  list: (req, res) => {
    try {
      const backups = mapBackupFiles();
      res.json({ backups });
    } catch (error) {
      console.error('Backup Liste Fehler:', error);
      res.status(500).json({ error: 'Backups konnten nicht geladen werden' });
    }
  },

  create: (req, res) => {
    try {
      ensureBackupDir();
      
      if (!fs.existsSync(dbPath)) {
        return res.status(400).json({ error: 'Keine Datenbank gefunden' });
      }

      // Prüfe DB-Aktualität
      checkDatabaseCurrency((err, dbStats) => {
        // Lokale Zeit verwenden statt UTC
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
        const backupName = `werkstatt_backup_${timestamp}.db`;
        const dest = path.join(backupDir, backupName);

        try {
          fs.copyFileSync(dbPath, dest);
          const stats = fs.statSync(dest);
          
          // Verwende jetzt() statt stats.mtime für korrektes Erstellungsdatum
          const jetzt = new Date();

          const response = {
            message: 'Backup erstellt',
            backup: { 
              name: backupName, 
              sizeBytes: stats.size, 
              createdAt: jetzt
            }
          };

          // Warnung hinzufügen wenn DB veraltet ist
          if (!err && dbStats) {
            response.datenStatus = {
              totalTermine: dbStats.totalTermine,
              neusterTermin: dbStats.neusterTermin,
              termineLetzteSiebenTage: dbStats.termineLetzteSiebenTage
            };
            
            if (dbStats.istVeraltet) {
              response.warnung = `⚠️ Die Datenbank enthält keine aktuellen Termine. Neuester Termin: ${dbStats.neusterTermin} (vor ${dbStats.alterInTagen} Tagen)`;
              console.warn('🔴 WARNUNG: Backup erstellt, aber DB enthält veraltete Daten!', dbStats);
            } else {
              console.log('✅ Backup erstellt mit aktuellen Daten:', dbStats);
            }
          }

          res.json(response);
        } catch (copyError) {
          console.error('Backup Kopier-Fehler:', copyError);
          res.status(500).json({ error: 'Backup konnte nicht erstellt werden' });
        }
      });
    } catch (error) {
      console.error('Backup Erstellung Fehler:', error);
      res.status(500).json({ error: 'Backup konnte nicht erstellt werden' });
    }
  },

  restore: async (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename) {
        return res.status(400).json({ error: 'Dateiname fehlt' });
      }

      const source = path.join(backupDir, path.basename(filename));
      if (!fs.existsSync(source)) {
        return res.status(404).json({ error: 'Backup nicht gefunden' });
      }

      ensureBackupDir();
      
      // Wichtig: Erst Datenbankverbindung schließen, dann Datei ersetzen, dann neu verbinden
      console.log('🔄 Bereite Backup-Restore vor...');
      await reconnectDatabase(); // Schließt alte Verbindung
      
      // Jetzt Datei ersetzen (Verbindung ist geschlossen)
      fs.copyFileSync(source, dbPath);
      console.log('📁 Backup-Datei kopiert:', path.basename(source));
      
      // Verbindung neu herstellen
      await reconnectDatabase();
      
      // Führe Migrationen auf der wiederhergestellten Datenbank aus
      initializeDatabase();
      console.log('✅ Backup eingespielt und Migrationen ausgeführt:', path.basename(source));
      
      res.json({ 
        message: 'Backup eingespielt und Migrationen ausgeführt', 
        restored: path.basename(source),
        hinweis: 'Die Datenbank wurde neu verbunden. Ein Browser-Refresh wird empfohlen.'
      });
    } catch (error) {
      console.error('Backup Restore Fehler:', error);
      res.status(500).json({ error: 'Backup konnte nicht eingespielt werden: ' + error.message });
    }
  },

  upload: async (req, res) => {
    try {
      const { filename, fileBase64, restoreNow } = req.body || {};
      if (!filename || !fileBase64) {
        return res.status(400).json({ error: 'Datei oder Dateiname fehlt' });
      }

      const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const target = path.join(backupDir, safeName);

      ensureBackupDir();
      const buffer = Buffer.from(fileBase64, 'base64');
      fs.writeFileSync(target, buffer);

      if (restoreNow) {
        // Wichtig: Erst Datenbankverbindung schließen, dann Datei ersetzen, dann neu verbinden
        console.log('🔄 Bereite Upload+Restore vor...');
        await reconnectDatabase(); // Schließt alte Verbindung
        
        fs.copyFileSync(target, dbPath);
        console.log('📁 Backup-Datei kopiert:', safeName);
        
        // Verbindung neu herstellen
        await reconnectDatabase();
        
        // Führe Migrationen auf der wiederhergestellten Datenbank aus
        initializeDatabase();
        console.log('✅ Backup hochgeladen, eingespielt und Migrationen ausgeführt:', safeName);
      }

      const stats = fs.statSync(target);
      res.json({
        message: restoreNow ? 'Backup hochgeladen, eingespielt und Migrationen ausgeführt' : 'Backup hochgeladen',
        backup: { name: safeName, sizeBytes: stats.size, createdAt: stats.mtime },
        restored: !!restoreNow,
        hinweis: restoreNow ? 'Die Datenbank wurde neu verbunden. Ein Browser-Refresh wird empfohlen.' : undefined
      });
    } catch (error) {
      console.error('Backup Upload Fehler:', error);
      res.status(500).json({ error: 'Backup konnte nicht hochgeladen werden: ' + error.message });
    }
  },

  download: (req, res) => {
    try {
      const filename = path.basename(req.params.filename || '');
      const filePath = path.join(backupDir, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup nicht gefunden' });
      }

      res.download(filePath, filename);
    } catch (error) {
      console.error('Backup Download Fehler:', error);
      res.status(500).json({ error: 'Backup konnte nicht geladen werden' });
    }
  },

  delete: (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename) {
        return res.status(400).json({ error: 'Dateiname fehlt' });
      }

      const filePath = path.join(backupDir, path.basename(filename));
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup nicht gefunden' });
      }

      fs.unlinkSync(filePath);
      res.json({ message: 'Backup gelöscht', deleted: path.basename(filename) });
    } catch (error) {
      console.error('Backup Löschen Fehler:', error);
      res.status(500).json({ error: 'Backup konnte nicht gelöscht werden' });
    }
  },

  // Hilfsfunktionen für Electron IPC
  getBackupDir: () => backupDir,
  getDbPath: () => dbPath,
  mapBackupFiles,

  // Automatisches Backup beim Server-Start
  createAutoBackupOnStartup: () => {
    return new Promise((resolve, reject) => {
      try {
        ensureBackupDir();
        
        if (!fs.existsSync(dbPath)) {
          console.log('⏭️  Kein Auto-Backup: Keine Datenbank vorhanden');
          return resolve({ skipped: true, reason: 'Keine DB vorhanden' });
        }

        // Prüfe ob heute schon ein Backup existiert
        const heute = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const backups = mapBackupFiles();
        const heutigesBackup = backups.find(b => b.name.includes(heute));
        
        if (heutigesBackup) {
          console.log('✅ Auto-Backup: Backup von heute existiert bereits:', heutigesBackup.name);
          return resolve({ skipped: true, reason: 'Backup von heute existiert', existing: heutigesBackup.name });
        }

        // Erstelle Auto-Backup
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
        const backupName = `werkstatt_backup_AUTO_${timestamp}.db`;
        const dest = path.join(backupDir, backupName);

        fs.copyFileSync(dbPath, dest);
        const stats = fs.statSync(dest);
        
        console.log('💾 Auto-Backup erstellt beim Server-Start:', backupName);

        // Prüfe DB-Aktualität
        checkDatabaseCurrency((err, dbStats) => {
          const result = {
            created: true,
            backup: { 
              name: backupName, 
              sizeBytes: stats.size, 
              createdAt: stats.mtime 
            }
          };

          if (!err && dbStats) {
            result.datenStatus = dbStats;
            
            if (dbStats.istVeraltet) {
              const warnung = `⚠️  WARNUNG: Die Datenbank enthält keine aktuellen Termine!\n   Neuester Termin: ${dbStats.neusterTermin} (vor ${dbStats.alterInTagen} Tagen)\n   Total Termine: ${dbStats.totalTermine}\n   → Möglicherweise verwenden Sie eine Test-/Entwicklungs-DB`;
              console.warn('🔴', warnung);
              result.warnung = warnung;
            } else {
              console.log('✅ DB-Status: Aktuelle Daten vorhanden');
            }
          }

          resolve(result);
        });
      } catch (error) {
        console.error('❌ Auto-Backup Fehler:', error);
        reject(error);
      }
    });
  }
};

module.exports = BackupController;
