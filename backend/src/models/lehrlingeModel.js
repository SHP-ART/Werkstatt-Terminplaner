const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class LehrlingeModel {
  static async getAll() {
    return await allAsync('SELECT * FROM lehrlinge ORDER BY name', []);
  }

  static async getById(id) {
    return await getAsync('SELECT * FROM lehrlinge WHERE id = ?', [id]);
  }

  static async getAktive() {
    return await allAsync('SELECT * FROM lehrlinge WHERE aktiv = 1 ORDER BY name', []);
  }

  static async create(data) {
    const { name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv, mittagspause_start, berufsschul_wochen,
            wochenarbeitszeit_stunden, arbeitstage_pro_woche, pausenzeit_minuten,
            samstag_aktiv, samstag_start, samstag_ende, samstag_pausenzeit_minuten } = data;
    const result = await runAsync(
      `INSERT INTO lehrlinge (name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv, mittagspause_start, berufsschul_wochen,
       wochenarbeitszeit_stunden, arbeitstage_pro_woche, pausenzeit_minuten,
       samstag_aktiv, samstag_start, samstag_ende, samstag_pausenzeit_minuten)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, nebenzeit_prozent || 0, aufgabenbewaeltigung_prozent || 100, aktiv !== undefined ? aktiv : 1, mittagspause_start || '12:00', berufsschul_wochen || null,
       wochenarbeitszeit_stunden || 40, arbeitstage_pro_woche || 5, pausenzeit_minuten || 30,
       samstag_aktiv || 0, samstag_start || '09:00', samstag_ende || '12:00', samstag_pausenzeit_minuten || 0]
    );
    return { id: result.lastID, ...data };
  }

  static async update(id, data) {
    const { name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv, mittagspause_start, berufsschul_wochen,
            wochenarbeitszeit_stunden, arbeitstage_pro_woche, pausenzeit_minuten,
            samstag_aktiv, samstag_start, samstag_ende, samstag_pausenzeit_minuten } = data;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (nebenzeit_prozent !== undefined) {
      updates.push('nebenzeit_prozent = ?');
      values.push(nebenzeit_prozent);
    }
    if (aufgabenbewaeltigung_prozent !== undefined) {
      updates.push('aufgabenbewaeltigung_prozent = ?');
      values.push(aufgabenbewaeltigung_prozent);
    }
    if (aktiv !== undefined) {
      updates.push('aktiv = ?');
      values.push(aktiv);
    }
    if (mittagspause_start !== undefined) {
      updates.push('mittagspause_start = ?');
      values.push(mittagspause_start);
    }
    if (berufsschul_wochen !== undefined) {
      updates.push('berufsschul_wochen = ?');
      values.push(berufsschul_wochen);
    }
    if (wochenarbeitszeit_stunden !== undefined) {
      updates.push('wochenarbeitszeit_stunden = ?');
      values.push(wochenarbeitszeit_stunden);
    }
    if (arbeitstage_pro_woche !== undefined) {
      updates.push('arbeitstage_pro_woche = ?');
      values.push(arbeitstage_pro_woche);
    }
    if (pausenzeit_minuten !== undefined) {
      updates.push('pausenzeit_minuten = ?');
      values.push(pausenzeit_minuten);
    }
    if (samstag_aktiv !== undefined) {
      updates.push('samstag_aktiv = ?');
      values.push(samstag_aktiv ? 1 : 0);
    }
    if (samstag_start !== undefined) {
      updates.push('samstag_start = ?');
      values.push(samstag_start);
    }
    if (samstag_ende !== undefined) {
      updates.push('samstag_ende = ?');
      values.push(samstag_ende);
    }
    if (samstag_pausenzeit_minuten !== undefined) {
      updates.push('samstag_pausenzeit_minuten = ?');
      values.push(samstag_pausenzeit_minuten);
    }

    if (updates.length === 0) {
      throw new Error('Keine Felder zum Aktualisieren');
    }

    values.push(id);

    const result = await runAsync(
      `UPDATE lehrlinge SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return { changes: result.changes };
  }

  static async delete(id) {
    const result = await runAsync('DELETE FROM lehrlinge WHERE id = ?', [id]);
    return { changes: result.changes };
  }
}

module.exports = LehrlingeModel;

