const { db } = require('../config/database');

class KundenModel {
  static getAll(callback) {
    db.all('SELECT * FROM kunden ORDER BY name', callback);
  }

  static create(kunde, callback) {
    const { name, telefon, email, adresse, locosoft_id } = kunde;
    db.run(
      'INSERT INTO kunden (name, telefon, email, adresse, locosoft_id) VALUES (?, ?, ?, ?, ?)',
      [name, telefon, email, adresse, locosoft_id],
      callback
    );
  }

  static importMultiple(kunden, callback) {
    const stmt = db.prepare('INSERT INTO kunden (name, telefon, email, adresse, locosoft_id) VALUES (?, ?, ?, ?, ?)');

    let imported = 0;
    kunden.forEach(kunde => {
      stmt.run([kunde.name, kunde.telefon, kunde.email, kunde.adresse, kunde.locosoft_id], (err) => {
        if (!err) imported++;
      });
    });

    stmt.finalize(() => callback(null, imported));
  }

  static getById(id, callback) {
    db.get('SELECT * FROM kunden WHERE id = ?', [id], callback);
  }

  static update(id, kunde, callback) {
    const { name, telefon, email, adresse, locosoft_id } = kunde;
    db.run(
      'UPDATE kunden SET name = ?, telefon = ?, email = ?, adresse = ?, locosoft_id = ? WHERE id = ?',
      [name, telefon, email, adresse, locosoft_id, id],
      callback
    );
  }

  static delete(id, callback) {
    db.run('DELETE FROM kunden WHERE id = ?', [id], callback);
  }
}

module.exports = KundenModel;
