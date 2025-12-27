const { db } = require('../config/database');

class EinstellungenModel {
  static getWerkstatt(callback) {
    db.get('SELECT * FROM werkstatt_einstellungen WHERE id = 1', callback);
  }

  static updateWerkstatt(data, callback) {
    const { mitarbeiter_anzahl, arbeitsstunden_pro_tag, pufferzeit_minuten } = data;
    const pufferzeit = pufferzeit_minuten !== undefined ? pufferzeit_minuten : 15;

    db.run(
      `UPDATE werkstatt_einstellungen
       SET mitarbeiter_anzahl = ?, arbeitsstunden_pro_tag = ?, pufferzeit_minuten = ?
       WHERE id = 1`,
      [mitarbeiter_anzahl, arbeitsstunden_pro_tag, pufferzeit],
      function(err) {
        if (err) {
          callback(err);
          return;
        }

        // Falls kein Datensatz existiert, lege ihn an.
        if (this.changes === 0) {
          db.run(
            `INSERT OR REPLACE INTO werkstatt_einstellungen
             (id, mitarbeiter_anzahl, arbeitsstunden_pro_tag, pufferzeit_minuten)
             VALUES (1, ?, ?, ?)`,
            [mitarbeiter_anzahl, arbeitsstunden_pro_tag, pufferzeit],
            callback
          );
        } else {
          callback(null, { changes: this.changes });
        }
      }
    );
  }
}

module.exports = EinstellungenModel;
