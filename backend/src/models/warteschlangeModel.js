const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

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

  static async getWarteschlange(datum, mitarbeiterId = null, excludeTerminId = null) {
    const where = [
      't.datum = ?',
      't.warteschlange_pos IS NOT NULL',
      't.mitarbeiter_id IS NOT NULL',
      't.geloescht_am IS NULL',
      "t.status NOT IN ('abgeschlossen', 'storniert')"
    ];
    const params = [datum];

    if (mitarbeiterId !== null) {
      where.push('t.mitarbeiter_id = ?');
      params.push(mitarbeiterId);
    }
    if (excludeTerminId !== null) {
      where.push('t.id != ?');
      params.push(excludeTerminId);
    }

    return await allAsync(`
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) AS kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) AS kunde_telefon,
             m.name AS mitarbeiter_name
        FROM termine t
        LEFT JOIN kunden k ON t.kunde_id = k.id
        LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.mitarbeiter_id, t.warteschlange_pos, t.id
    `, params);
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

  static async setPositionFuerMitarbeiter(id, mitarbeiterId, position) {
    return await runAsync(`
      UPDATE termine
         SET warteschlange_pos = ?
       WHERE id = ? AND mitarbeiter_id = ?
    `, [position, id, mitarbeiterId]);
  }

  static async zuweisen(id, mitarbeiterId, position) {
    await runAsync(`
      UPDATE termine
         SET mitarbeiter_id = ?,
             warteschlange_pos = ?,
             ist_schwebend = 0
       WHERE id = ?
    `, [mitarbeiterId, position, id]);
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
