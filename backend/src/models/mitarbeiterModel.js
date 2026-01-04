const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class MitarbeiterModel {
  static async getAll() {
    return await allAsync('SELECT * FROM mitarbeiter ORDER BY name', []);
  }

  static async getById(id) {
    return await getAsync('SELECT * FROM mitarbeiter WHERE id = ?', [id]);
  }

  static async getAktive() {
    return await allAsync('SELECT * FROM mitarbeiter WHERE aktiv = 1 ORDER BY name', []);
  }

  static async create(data) {
    const { name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service, mittagspause_start } = data;
    const result = await runAsync(
      'INSERT INTO mitarbeiter (name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service, mittagspause_start) VALUES (?, ?, ?, ?, ?, ?)',
      [name, arbeitsstunden_pro_tag || 8, nebenzeit_prozent || 0, aktiv !== undefined ? aktiv : 1, nur_service ? 1 : 0, mittagspause_start || '12:00']
    );
    return { id: result.lastID, ...data };
  }

  static async update(id, data) {
    const { name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service, mittagspause_start } = data;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (arbeitsstunden_pro_tag !== undefined) {
      updates.push('arbeitsstunden_pro_tag = ?');
      values.push(arbeitsstunden_pro_tag);
    }
    if (nebenzeit_prozent !== undefined) {
      updates.push('nebenzeit_prozent = ?');
      values.push(nebenzeit_prozent);
    }
    if (aktiv !== undefined) {
      updates.push('aktiv = ?');
      values.push(aktiv);
    }
    if (nur_service !== undefined) {
      updates.push('nur_service = ?');
      values.push(nur_service ? 1 : 0);
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
      `UPDATE mitarbeiter SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return { changes: result.changes };
  }

  static async delete(id) {
    const result = await runAsync('DELETE FROM mitarbeiter WHERE id = ?', [id]);
    return { changes: result.changes };
  }
}

module.exports = MitarbeiterModel;

