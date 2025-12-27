const { db } = require('../config/database');

class LehrlingeModel {
  static getAll(callback) {
    db.all('SELECT * FROM lehrlinge ORDER BY name', callback);
  }

  static getById(id, callback) {
    db.get('SELECT * FROM lehrlinge WHERE id = ?', [id], callback);
  }

  static getAktive(callback) {
    db.all('SELECT * FROM lehrlinge WHERE aktiv = 1 ORDER BY name', callback);
  }

  static create(data, callback) {
    const { name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv } = data;
    db.run(
      'INSERT INTO lehrlinge (name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv) VALUES (?, ?, ?, ?)',
      [name, nebenzeit_prozent || 0, aufgabenbewaeltigung_prozent || 100, aktiv !== undefined ? aktiv : 1],
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { id: this.lastID, ...data });
      }
    );
  }

  static update(id, data, callback) {
    const { name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv } = data;
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

    if (updates.length === 0) {
      return callback(new Error('Keine Felder zum Aktualisieren'));
    }

    values.push(id);

    db.run(
      `UPDATE lehrlinge SET ${updates.join(', ')} WHERE id = ?`,
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
    db.run('DELETE FROM lehrlinge WHERE id = ?', [id], function(err) {
      if (err) {
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  }
}

module.exports = LehrlingeModel;

