const { db } = require('../config/database');

class MitarbeiterModel {
  static getAll(callback) {
    db.all('SELECT * FROM mitarbeiter ORDER BY name', callback);
  }

  static getById(id, callback) {
    db.get('SELECT * FROM mitarbeiter WHERE id = ?', [id], callback);
  }

  static getAktive(callback) {
    db.all('SELECT * FROM mitarbeiter WHERE aktiv = 1 ORDER BY name', callback);
  }

  static create(data, callback) {
    const { name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service } = data;
    db.run(
      'INSERT INTO mitarbeiter (name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service) VALUES (?, ?, ?, ?, ?)',
      [name, arbeitsstunden_pro_tag || 8, nebenzeit_prozent || 0, aktiv !== undefined ? aktiv : 1, nur_service ? 1 : 0],
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { id: this.lastID, ...data });
      }
    );
  }

  static update(id, data, callback) {
    const { name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service } = data;
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

    if (updates.length === 0) {
      return callback(new Error('Keine Felder zum Aktualisieren'));
    }

    values.push(id);

    db.run(
      `UPDATE mitarbeiter SET ${updates.join(', ')} WHERE id = ?`,
      values,
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { changes: this.changes });
      }
    );
  }

  static delete(id, callback) {
    db.run('DELETE FROM mitarbeiter WHERE id = ?', [id], function(err) {
      if (err) {
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  }
}

module.exports = MitarbeiterModel;

