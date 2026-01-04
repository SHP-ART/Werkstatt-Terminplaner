const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class EinstellungenModel {
  static async getWerkstatt() {
    return await getAsync('SELECT * FROM werkstatt_einstellungen WHERE id = 1', []);
  }

  static async updateWerkstatt(data) {
    const { pufferzeit_minuten, servicezeit_minuten, ersatzauto_anzahl, nebenzeit_prozent, mittagspause_minuten } = data;
    
    // Lade erst die aktuellen Werte, um unveränderte Felder beizubehalten
    const current = await this.getWerkstatt();
    
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
    const mittagspause = mittagspause_minuten !== undefined
      ? parseInt(mittagspause_minuten, 10)
      : (current && current.mittagspause_minuten !== undefined ? current.mittagspause_minuten : 30);

    const result = await runAsync(
      `UPDATE werkstatt_einstellungen
       SET pufferzeit_minuten = ?, servicezeit_minuten = ?, ersatzauto_anzahl = ?, nebenzeit_prozent = ?, mittagspause_minuten = ?
       WHERE id = 1`,
      [pufferzeit, servicezeit, ersatzautos, nebenzeit, mittagspause]
    );

    // Falls kein Datensatz existiert, lege ihn an.
    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen
         (id, pufferzeit_minuten, servicezeit_minuten, ersatzauto_anzahl, nebenzeit_prozent, mittagspause_minuten)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [pufferzeit, servicezeit, ersatzautos, nebenzeit, mittagspause]
      );
    }
    
    return { changes: result.changes };
  }

  // Zähle Ersatzautos die an einem bestimmten Tag vergeben sind
  static async getErsatzautoVerfuegbarkeit(datum) {
    // Hole Gesamtanzahl Ersatzautos
    const settings = await this.getWerkstatt();
    
    const gesamtAnzahl = settings?.ersatzauto_anzahl || 2;
    
    // Zähle wie viele Termine an diesem Tag ein Ersatzauto haben
    const row = await getAsync(
      `SELECT COUNT(*) as vergeben FROM termine 
       WHERE datum = ? AND ersatzauto = 1 AND status != 'storniert' AND geloescht = 0`,
      [datum]
    );
    
    const vergeben = row?.vergeben || 0;
    const verfuegbar = Math.max(gesamtAnzahl - vergeben, 0);
    
    return {
      gesamt: gesamtAnzahl,
      vergeben: vergeben,
      verfuegbar: verfuegbar,
      istVerfuegbar: verfuegbar > 0
    };
  }
}

module.exports = EinstellungenModel;
