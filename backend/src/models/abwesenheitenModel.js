const { db } = require('../config/database');

class AbwesenheitenModel {
  static getByDatum(datum, callback) {
    db.get('SELECT * FROM abwesenheiten WHERE datum = ?', [datum], callback);
  }

  static upsert(datum, urlaub, krank, callback) {
    db.run(
      `INSERT INTO abwesenheiten (datum, urlaub, krank)
       VALUES (?, ?, ?)
       ON CONFLICT(datum) DO UPDATE SET urlaub = excluded.urlaub, krank = excluded.krank`,
      [datum, urlaub, krank],
      callback
    );
  }
}

module.exports = AbwesenheitenModel;
