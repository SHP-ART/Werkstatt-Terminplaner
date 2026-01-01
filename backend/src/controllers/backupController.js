const fs = require('fs');
const path = require('path');
const { dbPath, dataDir } = require('../config/database');

const backupDir = path.join(dataDir, 'backups');

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
    return {
      name: file,
      sizeBytes: stats.size,
      createdAt: stats.mtime
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

      res.json({
        dbPath,
        backupDir,
        dbSizeBytes: dbStats ? dbStats.size : 0,
        lastBackup,
        backupCount: backups.length
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
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `werkstatt-backup-${timestamp}.db`;
      const dest = path.join(backupDir, backupName);

      if (!fs.existsSync(dbPath)) {
        return res.status(400).json({ error: 'Keine Datenbank gefunden' });
      }

      fs.copyFileSync(dbPath, dest);
      const stats = fs.statSync(dest);

      res.json({
        message: 'Backup erstellt',
        backup: { name: backupName, sizeBytes: stats.size, createdAt: stats.mtime }
      });
    } catch (error) {
      console.error('Backup Erstellung Fehler:', error);
      res.status(500).json({ error: 'Backup konnte nicht erstellt werden' });
    }
  },

  restore: (req, res) => {
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
      fs.copyFileSync(source, dbPath);
      res.json({ message: 'Backup eingespielt', restored: path.basename(source) });
    } catch (error) {
      console.error('Backup Restore Fehler:', error);
      res.status(500).json({ error: 'Backup konnte nicht eingespielt werden' });
    }
  },

  upload: (req, res) => {
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
        fs.copyFileSync(target, dbPath);
      }

      const stats = fs.statSync(target);
      res.json({
        message: restoreNow ? 'Backup hochgeladen und eingespielt' : 'Backup hochgeladen',
        backup: { name: safeName, sizeBytes: stats.size, createdAt: stats.mtime },
        restored: !!restoreNow
      });
    } catch (error) {
      console.error('Backup Upload Fehler:', error);
      res.status(500).json({ error: 'Backup konnte nicht hochgeladen werden' });
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
  mapBackupFiles
};

module.exports = BackupController;
