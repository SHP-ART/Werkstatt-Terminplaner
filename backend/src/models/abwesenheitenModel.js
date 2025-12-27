const { db } = require('../config/database');

class AbwesenheitenModel {
  // Legacy-Methoden für alte Abwesenheiten-Tabelle
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

  // Neue Methoden für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
  static getAll(callback) {
    const query = `
      SELECT
        ma.id,
        ma.mitarbeiter_id,
        ma.lehrling_id,
        ma.typ,
        ma.von_datum,
        ma.bis_datum,
        ma.erstellt_am,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM mitarbeiter_abwesenheiten ma
      LEFT JOIN mitarbeiter m ON ma.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON ma.lehrling_id = l.id
      ORDER BY ma.von_datum DESC
    `;
    db.all(query, [], callback);
  }

  static getByDateRange(vonDatum, bisDatum, callback) {
    const query = `
      SELECT
        ma.id,
        ma.mitarbeiter_id,
        ma.lehrling_id,
        ma.typ,
        ma.von_datum,
        ma.bis_datum,
        ma.erstellt_am,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM mitarbeiter_abwesenheiten ma
      LEFT JOIN mitarbeiter m ON ma.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON ma.lehrling_id = l.id
      WHERE (ma.von_datum <= ? AND ma.bis_datum >= ?)
         OR (ma.von_datum >= ? AND ma.von_datum <= ?)
      ORDER BY ma.von_datum
    `;
    db.all(query, [bisDatum, vonDatum, vonDatum, bisDatum], callback);
  }

  static getForDate(datum, callback) {
    const query = `
      SELECT
        ma.id,
        ma.mitarbeiter_id,
        ma.lehrling_id,
        ma.typ,
        ma.von_datum,
        ma.bis_datum,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM mitarbeiter_abwesenheiten ma
      LEFT JOIN mitarbeiter m ON ma.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON ma.lehrling_id = l.id
      WHERE ma.von_datum <= ? AND ma.bis_datum >= ?
      ORDER BY ma.von_datum
    `;
    db.all(query, [datum, datum], callback);
  }

  static create(data, callback) {
    const { mitarbeiter_id, lehrling_id, typ, von_datum, bis_datum } = data;

    db.run(
      `INSERT INTO mitarbeiter_abwesenheiten
       (mitarbeiter_id, lehrling_id, typ, von_datum, bis_datum)
       VALUES (?, ?, ?, ?, ?)`,
      [mitarbeiter_id || null, lehrling_id || null, typ, von_datum, bis_datum],
      callback
    );
  }

  static delete(id, callback) {
    db.run('DELETE FROM mitarbeiter_abwesenheiten WHERE id = ?', [id], callback);
  }

  static getById(id, callback) {
    const query = `
      SELECT
        ma.id,
        ma.mitarbeiter_id,
        ma.lehrling_id,
        ma.typ,
        ma.von_datum,
        ma.bis_datum,
        ma.erstellt_am,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM mitarbeiter_abwesenheiten ma
      LEFT JOIN mitarbeiter m ON ma.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON ma.lehrling_id = l.id
      WHERE ma.id = ?
    `;
    db.get(query, [id], callback);
  }
}

module.exports = AbwesenheitenModel;
