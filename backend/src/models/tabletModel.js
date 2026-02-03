const { db } = require('../config/database');

class TabletModel {
  /**
   * Liefert die Tablet-Einstellungen
   */
  static async getEinstellungen() {
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          display_ausschaltzeit,
          display_einschaltzeit,
          manueller_display_status,
          letztes_update
        FROM tablet_einstellungen
        WHERE id = 1
      `;

      db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          // Standardwerte zurückgeben
          resolve({
            display_ausschaltzeit: '18:10',
            display_einschaltzeit: '07:30',
            manueller_display_status: 'auto',
            letztes_update: null
          });
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Aktualisiert die Tablet-Einstellungen
   */
  static async updateEinstellungen(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tablet_einstellungen (id, display_ausschaltzeit, display_einschaltzeit, manueller_display_status, letztes_update)
        VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          display_ausschaltzeit = COALESCE(?, display_ausschaltzeit),
          display_einschaltzeit = COALESCE(?, display_einschaltzeit),
          manueller_display_status = COALESCE(?, manueller_display_status),
          letztes_update = CURRENT_TIMESTAMP
      `;

      const params = [
        data.display_ausschaltzeit || null,
        data.display_einschaltzeit || null,
        data.manueller_display_status || null,
        data.display_ausschaltzeit || null,
        data.display_einschaltzeit || null,
        data.manueller_display_status || null
      ];

      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Setzt den manuellen Display-Status
   */
  static async setDisplayManuell(status) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE tablet_einstellungen
        SET manueller_display_status = ?,
            letztes_update = CURRENT_TIMESTAMP
        WHERE id = 1
      `;

      db.run(sql, [status], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }
}

module.exports = TabletModel;
