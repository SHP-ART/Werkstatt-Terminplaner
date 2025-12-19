const { db } = require('../config/database');

class ArbeitszeitenModel {
  static getAll(callback) {
    db.all('SELECT * FROM arbeitszeiten ORDER BY bezeichnung', callback);
  }

  static update(id, data, callback) {
    const { standard_minuten, bezeichnung } = data;

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

    if (updates.length === 0) {
      return callback(new Error('Keine Felder zum Aktualisieren'));
    }

    values.push(id);

    db.run(
      `UPDATE arbeitszeiten SET ${updates.join(', ')} WHERE id = ?`,
      values,
      callback
    );
  }

  static create(arbeit, callback) {
    const { bezeichnung, standard_minuten } = arbeit;
    db.run(
      'INSERT INTO arbeitszeiten (bezeichnung, standard_minuten) VALUES (?, ?)',
      [bezeichnung, standard_minuten],
      callback
    );
  }

  static delete(id, callback) {
    db.run('DELETE FROM arbeitszeiten WHERE id = ?', [id], callback);
  }
}

module.exports = ArbeitszeitenModel;
