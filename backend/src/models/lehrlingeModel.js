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
    const { name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv, mittagspause_start } = data;
    const result = await runAsync(
      'INSERT INTO lehrlinge (name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv, mittagspause_start) VALUES (?, ?, ?, ?, ?)',
      [name, nebenzeit_prozent || 0, aufgabenbewaeltigung_prozent || 100, aktiv !== undefined ? aktiv : 1, mittagspause_start || '12:00']
    );
    return { id: result.lastID, ...data };
  }

  static async update(id, data) {
    const { name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv, mittagspause_start } = data;
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

