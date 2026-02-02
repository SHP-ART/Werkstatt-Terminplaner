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
        a.id,
        a.mitarbeiter_id,
        a.lehrling_id,
        a.typ,
        a.datum_von,
        a.datum_bis,
        a.beschreibung,
        a.erstellt_am,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM abwesenheiten a
      LEFT JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON a.lehrling_id = l.id
      ORDER BY a.datum_von DESC
    `;
    return await allAsync(query, []);
  }

  static async getByMitarbeiterId(mitarbeiter_id) {
    return await allAsync(`
      SELECT * FROM abwesenheiten 
      WHERE mitarbeiter_id = ? 
      ORDER BY datum_von DESC
    `, [mitarbeiter_id]);
  }

  static async getByLehrlingId(lehrling_id) {
    return await allAsync(`
      SELECT * FROM abwesenheiten 
      WHERE lehrling_id = ? 
      ORDER BY datum_von DESC
    `, [lehrling_id]);
  }

  static async getByDateRange(vonDatum, bisDatum) {
    const query = `
      SELECT
        a.id,
        a.mitarbeiter_id,
        a.lehrling_id,
        a.typ,
        a.datum_von,
        a.datum_bis,
        a.beschreibung,
        a.erstellt_am,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM abwesenheiten a
      LEFT JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON a.lehrling_id = l.id
      WHERE (a.datum_von <= ? AND a.datum_bis >= ?)
         OR (a.datum_von >= ? AND a.datum_von <= ?)
         OR (a.datum_bis >= ? AND a.datum_bis <= ?)
      ORDER BY a.datum_von
    `;
    return await allAsync(query, [bisDatum, vonDatum, vonDatum, bisDatum, vonDatum, bisDatum]);
  }

  static async getForDate(datum) {
    const query = `
      SELECT
        a.id,
        a.mitarbeiter_id,
        a.lehrling_id,
        a.typ,
        a.datum_von,
        a.datum_bis,
        a.beschreibung,
        a.erstellt_am,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM abwesenheiten a
      LEFT JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON a.lehrling_id = l.id
      WHERE ? BETWEEN a.datum_von AND a.datum_bis
      ORDER BY a.typ, a.mitarbeiter_id, a.lehrling_id
    `;
    return await allAsync(query, [datum]);
  }

  static async create(data) {
    const { mitarbeiter_id, lehrling_id, typ, datum_von, datum_bis, beschreibung } = data;
    
    // Validierung: Entweder mitarbeiter_id ODER lehrling_id
    if ((!mitarbeiter_id && !lehrling_id) || (mitarbeiter_id && lehrling_id)) {
      throw new Error('Entweder mitarbeiter_id oder lehrling_id muss angegeben werden (nicht beide)');
    }

    const result = await runAsync(
      `INSERT INTO abwesenheiten (mitarbeiter_id, lehrling_id, typ, datum_von, datum_bis, beschreibung) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mitarbeiter_id || null, lehrling_id || null, typ, datum_von, datum_bis, beschreibung || null]
    );
    return { id: result.lastID, changes: result.changes };
  }

  static async update(id, data) {
    const { mitarbeiter_id, lehrling_id, typ, datum_von, datum_bis, beschreibung } = data;
    const updates = [];
    const values = [];

    if (mitarbeiter_id !== undefined) {
      updates.push('mitarbeiter_id = ?');
      values.push(mitarbeiter_id || null);
    }
    if (lehrling_id !== undefined) {
      updates.push('lehrling_id = ?');
      values.push(lehrling_id || null);
    }
    if (typ !== undefined) {
      updates.push('typ = ?');
      values.push(typ);
    }
    if (datum_von !== undefined) {
      updates.push('datum_von = ?');
      values.push(datum_von);
    }
    if (datum_bis !== undefined) {
      updates.push('datum_bis = ?');
      values.push(datum_bis);
    }
    if (beschreibung !== undefined) {
      updates.push('beschreibung = ?');
      values.push(beschreibung);
    }

    if (updates.length === 0) {
      throw new Error('Keine Felder zum Aktualisieren');
    }

    values.push(id);

    const result = await runAsync(
      `UPDATE abwesenheiten SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return { changes: result.changes };
  }

  static async delete(id) {
    const result = await runAsync('DELETE FROM abwesenheiten WHERE id = ?', [id]);
    return { changes: result.changes };
  }

  static async getById(id) {
    const query = `
      SELECT
        a.id,
        a.mitarbeiter_id,
        a.lehrling_id,
        a.typ,
        a.datum_von,
        a.datum_bis,
        a.beschreibung,
        a.erstellt_am,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM abwesenheiten a
      LEFT JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON a.lehrling_id = l.id
      WHERE a.id = ?
    `;
    return await getAsync(query, [id]);
  }

  // Prüft ob Mitarbeiter/Lehrling an einem bestimmten Datum abwesend ist
  static async isAbwesend(mitarbeiter_id, lehrling_id, datum) {
    const query = mitarbeiter_id 
      ? 'SELECT COUNT(*) as count FROM abwesenheiten WHERE mitarbeiter_id = ? AND ? BETWEEN datum_von AND datum_bis'
      : 'SELECT COUNT(*) as count FROM abwesenheiten WHERE lehrling_id = ? AND ? BETWEEN datum_von AND datum_bis';
    
    const result = await getAsync(query, [mitarbeiter_id || lehrling_id, datum]);
    return result.count > 0;
  }
}

module.exports = AbwesenheitenModel;
