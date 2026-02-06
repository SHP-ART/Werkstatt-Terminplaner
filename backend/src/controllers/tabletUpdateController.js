const fs = require('fs');
const path = require('path');
const TabletUpdateModel = require('../models/tabletUpdateModel');

/**
 * Controller für Tablet-App-Updates
 */
class TabletUpdateController {
  /**
   * Prüft ob ein Tablet-Update verfügbar ist
   */
  static async checkUpdate(req, res) {
    try {
      const currentVersion = req.query.version;
      
      if (!currentVersion) {
        return res.status(400).json({ error: 'Version fehlt' });
      }

      const updateInfo = await TabletUpdateModel.getLatestVersion();
      
      if (!updateInfo) {
        return res.json({
          updateAvailable: false,
          message: 'Keine Update-Informationen verfügbar'
        });
      }

      // Vergleiche Versionen
      const updateAvailable = TabletUpdateModel.compareVersions(currentVersion, updateInfo.version) < 0;

      res.json({
        updateAvailable,
        currentVersion,
        latestVersion: updateInfo.version,
        downloadUrl: updateAvailable ? `/api/tablet-update/download` : null,
        releaseNotes: updateInfo.releaseNotes,
        publishedAt: updateInfo.publishedAt
      });
    } catch (error) {
      console.error('Fehler beim Prüfen auf Tablet-Updates:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Lädt die neueste Tablet-App herunter
   */
  static async downloadUpdate(req, res) {
    try {
      const updateFile = await TabletUpdateModel.getUpdateFilePath();
      
      if (!updateFile || !fs.existsSync(updateFile)) {
        return res.status(404).json({ error: 'Update-Datei nicht gefunden' });
      }

      const stat = fs.statSync(updateFile);
      const filename = path.basename(updateFile);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', stat.size);

      const fileStream = fs.createReadStream(updateFile);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Fehler beim Download der Tablet-App:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Registriert eine neue Tablet-Update-Version (Admin)
   */
  static async registerUpdate(req, res) {
    try {
      const { version, filePath, releaseNotes } = req.body;

      if (!version || !filePath) {
        return res.status(400).json({ error: 'Version und Dateipfad erforderlich' });
      }

      // Prüfe ob Datei existiert
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'Update-Datei nicht gefunden' });
      }

      const result = await TabletUpdateModel.registerUpdate({
        version,
        filePath,
        releaseNotes: releaseNotes || ''
      });

      res.json({
        success: true,
        message: 'Update registriert',
        updateId: result.id
      });
    } catch (error) {
      console.error('Fehler beim Registrieren des Updates:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Liefert Update-Status aller verbundenen Tablets
   */
  static async getUpdateStatus(req, res) {
    try {
      const tablets = await TabletUpdateModel.getConnectedTablets();
      res.json(tablets);
    } catch (error) {
      console.error('Fehler beim Abrufen des Update-Status:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Meldet Tablet-Status (von Tablet aufgerufen)
   */
  static async reportStatus(req, res) {
    try {
      const { version, hostname, ip } = req.body;

      if (!version) {
        return res.status(400).json({ error: 'Version erforderlich' });
      }

      await TabletUpdateModel.updateTabletStatus({
        version,
        hostname: hostname || req.hostname,
        ip: ip || req.ip,
        lastSeen: new Date()
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Fehler beim Speichern des Tablet-Status:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = TabletUpdateController;
