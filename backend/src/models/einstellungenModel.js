const { db } = require('../config/database');

class EinstellungenModel {
  static getWerkstatt(callback) {
    db.get('SELECT * FROM werkstatt_einstellungen WHERE id = 1', callback);
  }

  static updateWerkstatt(data, callback) {
    const { pufferzeit_minuten, servicezeit_minuten, ersatzauto_anzahl, nebenzeit_prozent } = data;
    
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
      const ersatzautos = ersatzauto_anzahl !== undefined
        ? parseInt(ersatzauto_anzahl, 10)
        : (current && current.ersatzauto_anzahl !== undefined ? current.ersatzauto_anzahl : 2);
      const nebenzeit = nebenzeit_prozent !== undefined
        ? parseFloat(nebenzeit_prozent)
        : (current && current.nebenzeit_prozent !== undefined ? current.nebenzeit_prozent : 0);

      db.run(
        `UPDATE werkstatt_einstellungen
         SET pufferzeit_minuten = ?, servicezeit_minuten = ?, ersatzauto_anzahl = ?, nebenzeit_prozent = ?
         WHERE id = 1`,
        [pufferzeit, servicezeit, ersatzautos, nebenzeit],
        function(err) {
          if (err) {
            callback(err);
            return;
          }

          // Falls kein Datensatz existiert, lege ihn an.
          if (this.changes === 0) {
            db.run(
              `INSERT OR REPLACE INTO werkstatt_einstellungen
               (id, pufferzeit_minuten, servicezeit_minuten, ersatzauto_anzahl, nebenzeit_prozent)
               VALUES (1, ?, ?, ?, ?)`,
              [pufferzeit, servicezeit, ersatzautos, nebenzeit],
              callback
            );
          } else {
            callback(null, { changes: this.changes });
          }
        }
      );
    });
  }

  // Zähle Ersatzautos die an einem bestimmten Tag vergeben sind
  static getErsatzautoVerfuegbarkeit(datum, callback) {
    // Hole Gesamtanzahl Ersatzautos
    this.getWerkstatt((err, settings) => {
      if (err) return callback(err);
      
      const gesamtAnzahl = settings?.ersatzauto_anzahl || 2;
      
      // Zähle wie viele Termine an diesem Tag ein Ersatzauto haben
      db.get(
        `SELECT COUNT(*) as vergeben FROM termine 
         WHERE datum = ? AND ersatzauto = 1 AND status != 'storniert' AND geloescht = 0`,
        [datum],
        (err, row) => {
          if (err) return callback(err);
          
          const vergeben = row?.vergeben || 0;
          const verfuegbar = Math.max(gesamtAnzahl - vergeben, 0);
          
          callback(null, {
            gesamt: gesamtAnzahl,
            vergeben: vergeben,
            verfuegbar: verfuegbar,
            istVerfuegbar: verfuegbar > 0
          });
        }
      );
    });
  }
}

module.exports = EinstellungenModel;
