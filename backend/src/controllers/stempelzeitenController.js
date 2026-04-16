const { allAsync, runAsync } = require('../utils/dbHelper');
const { broadcastEvent } = require('../utils/websocket');

const ZEIT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

class StempelzeitenController {
  static async getTagUebersicht(req, res) {
    try {
      const datum = req.query.datum || new Date().toISOString().slice(0, 10);

      const rows = await allAsync(`
        SELECT
          ta.id        AS arbeit_id,
          ta.termin_id,
          ta.arbeit,
          ta.zeit      AS geschaetzte_min,
          ta.stempel_start,
          ta.stempel_ende,
          ta.reihenfolge,
          t.termin_nr,
          t.kennzeichen,
          t.kunde_name,
          'mitarbeiter' AS person_typ,
          m.id          AS person_id,
          m.name        AS person_name
        FROM termine_arbeiten ta
        JOIN termine t ON ta.termin_id = t.id
        JOIN mitarbeiter m ON ta.mitarbeiter_id = m.id
        WHERE t.datum = ?
          AND ta.mitarbeiter_id IS NOT NULL

        UNION ALL

        SELECT
          ta.id        AS arbeit_id,
          ta.termin_id,
          ta.arbeit,
          ta.zeit      AS geschaetzte_min,
          ta.stempel_start,
          ta.stempel_ende,
          ta.reihenfolge,
          t.termin_nr,
          t.kennzeichen,
          t.kunde_name,
          'lehrling'   AS person_typ,
          l.id         AS person_id,
          l.name        AS person_name
        FROM termine_arbeiten ta
        JOIN termine t ON ta.termin_id = t.id
        JOIN lehrlinge l ON ta.lehrling_id = l.id
        WHERE t.datum = ?
          AND ta.lehrling_id IS NOT NULL

        ORDER BY person_name, termin_id, reihenfolge
      `, [datum, datum]);

      const gruppenMap = new Map();
      for (const row of rows) {
        const key = `${row.person_typ}_${row.person_id}`;
        if (!gruppenMap.has(key)) {
          gruppenMap.set(key, {
            person_typ: row.person_typ,
            person_id: row.person_id,
            person_name: row.person_name,
            arbeiten: []
          });
        }
        const istMin = row.stempel_start && row.stempel_ende
          ? StempelzeitenController._diffMinuten(row.stempel_start, row.stempel_ende)
          : null;
        gruppenMap.get(key).arbeiten.push({
          arbeit_id:       row.arbeit_id,
          termin_id:       row.termin_id,
          termin_nr:       row.termin_nr,
          kennzeichen:     row.kennzeichen,
          kunde_name:      row.kunde_name,
          arbeit:          row.arbeit,
          geschaetzte_min: row.geschaetzte_min,
          stempel_start:   row.stempel_start,
          stempel_ende:    row.stempel_ende,
          ist_min:         istMin
        });
      }

      res.json(Array.from(gruppenMap.values()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async setStempel(req, res) {
    try {
      const { termin_id, arbeit_name, stempel_start, stempel_ende } = req.body;

      if (!termin_id || !arbeit_name) {
        return res.status(400).json({ error: 'termin_id und arbeit_name sind Pflichtfelder' });
      }
      if (stempel_start !== undefined && stempel_start !== null && !ZEIT_REGEX.test(stempel_start)) {
        return res.status(400).json({ error: 'stempel_start muss Format HH:MM haben' });
      }
      if (stempel_ende !== undefined && stempel_ende !== null && !ZEIT_REGEX.test(stempel_ende)) {
        return res.status(400).json({ error: 'stempel_ende muss Format HH:MM haben' });
      }

      const updates = [];
      const values = [];
      if (stempel_start !== undefined) { updates.push('stempel_start = ?'); values.push(stempel_start); }
      if (stempel_ende !== undefined)  { updates.push('stempel_ende = ?');  values.push(stempel_ende);  }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Mindestens stempel_start oder stempel_ende angeben' });
      }

      values.push(termin_id, arbeit_name);
      const result = await runAsync(
        `UPDATE termine_arbeiten SET ${updates.join(', ')} WHERE termin_id = ? AND arbeit = ?`,
        values
      );

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Arbeit nicht gefunden' });
      }

      broadcastEvent('stempel.updated', { termin_id, arbeit_name });
      res.json({ changes: result.changes, message: 'Stempel gesetzt' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static _diffMinuten(start, ende) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = ende.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff >= 0 ? diff : null;
  }
}

module.exports = StempelzeitenController;
