const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) return null;

  return {
    ...row,
    erkannte_daten: parseJsonField(row.erkannte_daten, null),
    zuordnungs_treffer: parseJsonField(row.zuordnungs_treffer, [])
  };
}

class AuftragsimportModel {
  static async getAll(filters = {}) {
    const where = [];
    const params = [];

    if (filters.status) {
      where.push('ai.status = ?');
      params.push(filters.status);
    }

    if (filters.offen) {
      where.push("ai.status IN ('neu', 'erkannt', 'fehler')");
    }

    if (filters.eingang) {
      where.push(`(
        ai.status IN ('neu', 'erkannt', 'fehler')
        OR date(ai.erstellt_am, 'localtime') = date('now', 'localtime')
        OR date(ai.verarbeitet_am, 'localtime') = date('now', 'localtime')
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await allAsync(
      `SELECT ai.*, t.termin_nr, t.datum AS termin_datum, t.kunde_name AS termin_kunde_name
         FROM auftragsimporte ai
         LEFT JOIN termine t ON t.id = ai.termin_id
        ${whereSql}
        ORDER BY ai.erstellt_am DESC, ai.id DESC`,
      params
    );

    return rows.map(mapRow);
  }

  static async getById(id) {
    const row = await getAsync(
      `SELECT ai.*, t.termin_nr, t.datum AS termin_datum, t.kunde_name AS termin_kunde_name
         FROM auftragsimporte ai
         LEFT JOIN termine t ON t.id = ai.termin_id
        WHERE ai.id = ?`,
      [id]
    );
    return mapRow(row);
  }

  static async findByHash(hash) {
    if (!hash) return null;
    const row = await getAsync('SELECT * FROM auftragsimporte WHERE datei_hash = ? LIMIT 1', [hash]);
    return mapRow(row);
  }

  static async create(data) {
    const result = await runAsync(
      `INSERT INTO auftragsimporte
       (termin_id, original_dateiname, dateipfad, status, text_extract, erkannte_daten,
        fehler, zuordnungs_treffer, dateigroesse, datei_hash, verarbeitet_am)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.termin_id || null,
        data.original_dateiname,
        data.dateipfad,
        data.status || 'neu',
        data.text_extract || null,
        data.erkannte_daten ? JSON.stringify(data.erkannte_daten) : null,
        data.fehler || null,
        data.zuordnungs_treffer ? JSON.stringify(data.zuordnungs_treffer) : null,
        data.dateigroesse || null,
        data.datei_hash || null,
        data.verarbeitet_am || null
      ]
    );

    return this.getById(result.lastID);
  }

  static async update(id, data) {
    const updates = [];
    const params = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined) return;

      if (key === 'erkannte_daten' || key === 'zuordnungs_treffer') {
        updates.push(`${key} = ?`);
        params.push(value ? JSON.stringify(value) : null);
        return;
      }

      updates.push(`${key} = ?`);
      params.push(value);
    });

    if (updates.length === 0) return { changes: 0 };

    params.push(id);
    return await runAsync(
      `UPDATE auftragsimporte SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }
}

module.exports = AuftragsimportModel;
