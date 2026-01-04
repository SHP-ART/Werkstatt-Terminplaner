const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class ArbeitszeitenModel {
  static async getAll() {
    return await allAsync('SELECT * FROM arbeitszeiten ORDER BY bezeichnung', []);
  }

  static async update(id, data) {
    const { standard_minuten, bezeichnung, aliase } = data;

    // Baue die SQL-Query dynamisch auf, je nachdem welche Felder vorhanden sind
    const updates = [];
    const values = [];

    if (standard_minuten !== undefined) {
      updates.push('standard_minuten = ?');
      values.push(standard_minuten);
    }

    if (bezeichnung !== undefined) {
      updates.push('bezeichnung = ?');
      values.push(bezeichnung);
    }

    if (aliase !== undefined) {
      updates.push('aliase = ?');
      values.push(aliase);
    }

    if (updates.length === 0) {
      throw new Error('Keine Felder zum Aktualisieren');
    }

    values.push(id);

    const result = await runAsync(
      `UPDATE arbeitszeiten SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return { changes: result.changes };
  }

  static async create(arbeit) {
    const { bezeichnung, standard_minuten, aliase } = arbeit;
    return await runAsync(
      'INSERT INTO arbeitszeiten (bezeichnung, standard_minuten, aliase) VALUES (?, ?, ?)',
      [bezeichnung, standard_minuten, aliase || '']
    );
  }

  static async delete(id) {
    const result = await runAsync('DELETE FROM arbeitszeiten WHERE id = ?', [id]);
    return { changes: result.changes };
  }

  static async findByBezeichnung(bezeichnung) {
    // Suche zuerst nach exakter Bezeichnung
    const row = await getAsync(
      'SELECT * FROM arbeitszeiten WHERE LOWER(bezeichnung) = LOWER(?)',
      [bezeichnung]
    );
    
    if (row) return row;
    
    // Falls nicht gefunden, suche in Aliasen
    const rows = await allAsync('SELECT * FROM arbeitszeiten WHERE aliase IS NOT NULL AND aliase != ""', []);
    
    const suchBegriff = bezeichnung.toLowerCase();
    for (const arbeit of rows) {
      if (arbeit.aliase) {
        const aliasListe = arbeit.aliase.split(',').map(a => a.trim().toLowerCase());
        if (aliasListe.includes(suchBegriff)) {
          return arbeit;
        }
      }
    }
    return null;
  }

  static async updateByBezeichnung(bezeichnung, neueStandardzeit) {
    // Gewichteter Durchschnitt: 70% alte Zeit, 30% neue Zeit
    const row = await getAsync(
      'SELECT * FROM arbeitszeiten WHERE LOWER(bezeichnung) = LOWER(?)',
      [bezeichnung]
    );

    if (!row) {
      return { changes: 0, message: 'Arbeit nicht gefunden' };
    }

    const alteZeit = row.standard_minuten || 30;
    const gewichteteZeit = Math.round((alteZeit * 0.7) + (neueStandardzeit * 0.3));

    const result = await runAsync(
      'UPDATE arbeitszeiten SET standard_minuten = ? WHERE LOWER(bezeichnung) = LOWER(?)',
      [gewichteteZeit, bezeichnung]
    );
    
    return {
      changes: result.changes,
      alte_zeit: alteZeit,
      neue_zeit: gewichteteZeit,
      tatsaechliche_zeit: neueStandardzeit
    };
  }
}

module.exports = ArbeitszeitenModel;
