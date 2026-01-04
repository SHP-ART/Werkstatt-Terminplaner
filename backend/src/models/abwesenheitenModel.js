const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class AbwesenheitenModel {
  // Legacy-Methoden für alte Abwesenheiten-Tabelle
  static async getByDatum(datum) {
    return await getAsync('SELECT * FROM abwesenheiten WHERE datum = ?', [datum]);
  }

  static async upsert(datum, urlaub, krank) {
    return await runAsync(
      `INSERT INTO abwesenheiten (datum, urlaub, krank)
       VALUES (?, ?, ?)
       ON CONFLICT(datum) DO UPDATE SET urlaub = excluded.urlaub, krank = excluded.krank`,
      [datum, urlaub, krank]
    );
  }

  // Neue Methoden für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
  static async getAll() {
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
    return await allAsync(query, []);
  }

  static async getByDateRange(vonDatum, bisDatum) {
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
    return await allAsync(query, [bisDatum, vonDatum, vonDatum, bisDatum]);
  }

  static async getForDate(datum) {
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
    return await allAsync(query, [datum, datum]);
  }

  static async create(data) {
    const { mitarbeiter_id, lehrling_id, typ, von_datum, bis_datum } = data;

    return await runAsync(
      `INSERT INTO mitarbeiter_abwesenheiten
       (mitarbeiter_id, lehrling_id, typ, von_datum, bis_datum)
       VALUES (?, ?, ?, ?, ?)`,
      [mitarbeiter_id || null, lehrling_id || null, typ, von_datum, bis_datum]
    );
  }

  static async delete(id) {
    return await runAsync('DELETE FROM mitarbeiter_abwesenheiten WHERE id = ?', [id]);
  }

  static async getById(id) {
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
    return await getAsync(query, [id]);
  }
}

module.exports = AbwesenheitenModel;
