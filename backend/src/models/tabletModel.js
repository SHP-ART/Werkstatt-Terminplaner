const { db } = require('../config/database');

class TabletModel {
  /**
   * Liefert die Tablet-Einstellungen
   * DB-Spalten: display_aus_zeit, display_ein_zeit, manuell_status, aktualisiert_am
   */
  static async getEinstellungen() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          display_aus_zeit AS display_ausschaltzeit,
          display_ein_zeit AS display_einschaltzeit,
          manuell_status   AS manueller_display_status,
          aktualisiert_am  AS letztes_update
        FROM tablet_einstellungen
        WHERE id = 1
      `;

      db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve({
            display_ausschaltzeit: '18:00',
            display_einschaltzeit: '07:00',
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
        INSERT INTO tablet_einstellungen (id, display_aus_zeit, display_ein_zeit, manuell_status, aktualisiert_am)
        VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          display_aus_zeit = COALESCE(?, display_aus_zeit),
          display_ein_zeit = COALESCE(?, display_ein_zeit),
          manuell_status   = COALESCE(?, manuell_status),
          aktualisiert_am  = CURRENT_TIMESTAMP
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
        SET manuell_status  = ?,
            aktualisiert_am = CURRENT_TIMESTAMP
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
