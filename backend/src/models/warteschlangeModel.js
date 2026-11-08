const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

function resourceColumn(ressource) {
  return ressource.typ === 'lehrling' ? 'lehrling_id' : 'mitarbeiter_id';
}

class WarteschlangeModel {
  static async getTermin(id) {
    return await getAsync('SELECT * FROM termine WHERE id = ?', [id]);
  }

  static async getMitarbeiter(id) {
    return await getAsync('SELECT * FROM mitarbeiter WHERE id = ?', [id]);
  }

  static async getAktiveMitarbeiter() {
    return await allAsync('SELECT * FROM mitarbeiter WHERE aktiv = 1 ORDER BY name', []);
  }

  static async getWarteschlange(datum, ressource = null, excludeTerminId = null) {
    const where = [
      't.datum = ?',
      't.warteschlange_pos IS NOT NULL',
      '(t.mitarbeiter_id IS NOT NULL OR t.lehrling_id IS NOT NULL)',
      't.geloescht_am IS NULL',
      "t.status NOT IN ('abgeschlossen', 'storniert')"
    ];
    const params = [datum];

    if (ressource !== null) {
      where.push(`t.${resourceColumn(ressource)} = ?`);
      params.push(ressource.id);
    }
    if (excludeTerminId !== null) {
      where.push('t.id != ?');
      params.push(excludeTerminId);
    }

    return await allAsync(`
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) AS kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) AS kunde_telefon,
             m.name AS mitarbeiter_name,
             l.name AS lehrling_name
        FROM termine t
        LEFT JOIN kunden k ON t.kunde_id = k.id
        LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
        LEFT JOIN lehrlinge l ON t.lehrling_id = l.id
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN t.mitarbeiter_id IS NOT NULL THEN 0 ELSE 1 END,
                t.mitarbeiter_id, t.lehrling_id, t.warteschlange_pos, t.id
    `, params);
  }

  static async getNaechster(datum, ressource) {
    return await getAsync(`
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) AS kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) AS kunde_telefon,
             m.name AS mitarbeiter_name,
             l.name AS lehrling_name
        FROM termine t
        LEFT JOIN kunden k ON t.kunde_id = k.id
        LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
        LEFT JOIN lehrlinge l ON t.lehrling_id = l.id
       WHERE t.datum = ?
         AND t.${resourceColumn(ressource)} = ?
         AND t.warteschlange_pos IS NOT NULL
         AND t.geloescht_am IS NULL
         AND COALESCE(t.ist_schwebend, 0) = 0
         AND t.status IN ('geplant', 'in_arbeit')
       ORDER BY t.warteschlange_pos, t.id
       LIMIT 1
    `, [datum, ressource.id]);
  }

  static async getArbeiten(terminId) {
    return await allAsync(`
      SELECT arbeit AS name,
             zeit,
             stempel_start,
             stempel_ende,
             CASE WHEN stempel_ende IS NOT NULL THEN 1 ELSE 0 END AS abgeschlossen
        FROM termine_arbeiten
       WHERE termin_id = ?
       ORDER BY reihenfolge, id
    `, [terminId]);
  }

  static async getNaechstePosition(datum, ressource, excludeTerminId = null) {
    const params = [datum, ressource.id];
    const exclude = excludeTerminId === null ? '' : 'AND id != ?';
    if (excludeTerminId !== null) params.push(excludeTerminId);

    const row = await getAsync(`
      SELECT MAX(warteschlange_pos) AS max_position
        FROM termine
       WHERE datum = ?
         AND ${resourceColumn(ressource)} = ?
         AND warteschlange_pos IS NOT NULL
         ${exclude}
    `, params);
    return (row?.max_position || 0) + 1;
  }

  static async getNeueTermine() {
    return await allAsync(`
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) AS kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) AS kunde_telefon
        FROM termine t
        LEFT JOIN kunden k ON t.kunde_id = k.id
       WHERE COALESCE(t.ist_schwebend, 0) = 1
         AND t.geloescht_am IS NULL
         AND t.status NOT IN ('abgeschlossen', 'storniert')
       ORDER BY CASE t.schwebend_prioritaet
                  WHEN 'hoch' THEN 1
                  WHEN 'mittel' THEN 2
                  WHEN 'niedrig' THEN 3
                  ELSE 2
                END,
                t.erstellt_am DESC,
                t.id DESC
    `, []);
  }

  static async setPosition(id, position) {
    return await runAsync(`
      UPDATE termine
         SET warteschlange_pos = ?
       WHERE id = ?
    `, [position, id]);
  }

  static async setPositionFuerRessource(id, ressource, position) {
    return await runAsync(`
      UPDATE termine
         SET warteschlange_pos = ?
       WHERE id = ? AND ${resourceColumn(ressource)} = ?
    `, [position, id, ressource.id]);
  }

  static async zuweisen(id, ressource, position, datum, arbeitszeitenDetails) {
    const mitarbeiterId = ressource.typ === 'mitarbeiter' ? ressource.id : null;
    const lehrlingId = ressource.typ === 'lehrling' ? ressource.id : null;
    await runAsync(`
      UPDATE termine
         SET mitarbeiter_id = ?,
             lehrling_id = ?,
             warteschlange_pos = ?,
             datum = ?,
             ist_schwebend = 0,
             arbeitszeiten_details = ?
       WHERE id = ?
    `, [mitarbeiterId, lehrlingId, position, datum, arbeitszeitenDetails, id]);
    return await this.getTermin(id);
  }

  static async aufNaechstenTagVerschieben(id, datum, position) {
    await runAsync(`
      UPDATE termine
         SET datum = ?,
             warteschlange_pos = ?,
             ist_schwebend = 0
       WHERE id = ?
    `, [datum, position, id]);
    return await this.getTermin(id);
  }
}

module.exports = WarteschlangeModel;
