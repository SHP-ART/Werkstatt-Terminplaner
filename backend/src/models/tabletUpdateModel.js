const db = require('../config/database');
const fs = require('fs');
const path = require('path');

/**
 * Model für Tablet-App-Update-Verwaltung
 */
class TabletUpdateModel {
  /**
   * Initialisiert die Update-Tabellen
   */
  static async initialize() {
    return new Promise((resolve, reject) => {
      // Tabellen einzeln erstellen (db.exec nicht verfügbar in allen sqlite3-Versionen)
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS tablet_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT NOT NULL,
            file_path TEXT NOT NULL,
            release_notes TEXT,
            published_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          db.run(`
            CREATE TABLE IF NOT EXISTS tablet_status (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              hostname TEXT UNIQUE,
              ip TEXT,
              version TEXT NOT NULL,
              last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }
            
            db.run(`
              CREATE INDEX IF NOT EXISTS idx_tablet_status_last_seen 
              ON tablet_status(last_seen)
            `, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        });
      });
    });
  }

  /**
   * Registriert eine neue Update-Version
   */
  static async registerUpdate(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tablet_updates (version, file_path, release_notes)
        VALUES (?, ?, ?)
      `;

      db.run(sql, [data.version, data.filePath, data.releaseNotes], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  /**
   * Liefert die neueste Update-Version
   */
  static async getLatestVersion() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT version, file_path, release_notes, published_at
        FROM tablet_updates
        ORDER BY published_at DESC
        LIMIT 1
      `;

      db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row ? {
          version: row.version,
          filePath: row.file_path,
          releaseNotes: row.release_notes,
          publishedAt: row.published_at
        } : null);
      });
    });
  }

  /**
   * Liefert den Pfad zur Update-Datei
   */
  static async getUpdateFilePath() {
    const latest = await this.getLatestVersion();
    return latest ? latest.filePath : null;
  }

  /**
   * Vergleicht zwei Versionsnummern
   * @returns -1 wenn v1 < v2, 0 wenn gleich, 1 wenn v1 > v2
   */
  static compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(n => parseInt(n, 10));
    const parts2 = v2.split('.').map(n => parseInt(n, 10));

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  }

  /**
   * Aktualisiert den Status eines Tablets
   */
  static async updateTabletStatus(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tablet_status (hostname, ip, version, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(hostname) DO UPDATE SET
          ip = ?,
          version = ?,
          last_seen = ?
      `;

      const now = new Date().toISOString();
      db.run(
        sql,
        [data.hostname, data.ip, data.version, now, data.ip, data.version, now],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  /**
   * Liefert alle verbundenen Tablets (in den letzten 5 Minuten aktiv)
   */
  static async getConnectedTablets() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT hostname, ip, version, last_seen
        FROM tablet_status
        WHERE datetime(last_seen) > datetime('now', '-5 minutes')
        ORDER BY last_seen DESC
      `;

      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Liefert alle Tablets (auch inaktive)
   */
  static async getAllTablets() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT hostname, ip, version, last_seen
        FROM tablet_status
        ORDER BY last_seen DESC
      `;

      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

module.exports = TabletUpdateModel;
