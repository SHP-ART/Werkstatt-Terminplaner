const { db } = require('../config/database');

class EinstellungenModel {
  static getWerkstatt(callback) {
    db.get('SELECT * FROM werkstatt_einstellungen WHERE id = 1', callback);
  }

  static updateWerkstatt(data, callback) {
    const { pufferzeit_minuten, servicezeit_minuten } = data;
    
    // Lade erst die aktuellen Werte, um unveränderte Felder beizubehalten
    this.getWerkstatt((err, current) => {
      if (err) {
        return callback(err);
      }
      
      // Verwende neue Werte wenn vorhanden, sonst behalte aktuelle Werte, sonst Standardwerte
      const pufferzeit = pufferzeit_minuten !== undefined 
        ? parseInt(pufferzeit_minuten, 10) 
        : (current && current.pufferzeit_minuten !== undefined ? current.pufferzeit_minuten : 15);
      const servicezeit = servicezeit_minuten !== undefined 
        ? parseInt(servicezeit_minuten, 10) 
        : (current && current.servicezeit_minuten !== undefined ? current.servicezeit_minuten : 10);

      db.run(
        `UPDATE werkstatt_einstellungen
         SET pufferzeit_minuten = ?, servicezeit_minuten = ?
         WHERE id = 1`,
        [pufferzeit, servicezeit],
        function(err) {
          if (err) {
            callback(err);
            return;
          }

          // Falls kein Datensatz existiert, lege ihn an.
          if (this.changes === 0) {
            db.run(
              `INSERT OR REPLACE INTO werkstatt_einstellungen
               (id, pufferzeit_minuten, servicezeit_minuten)
               VALUES (1, ?, ?)`,
              [pufferzeit, servicezeit],
              callback
            );
          } else {
            callback(null, { changes: this.changes });
          }
        }
      );
    });
  }
}

module.exports = EinstellungenModel;
