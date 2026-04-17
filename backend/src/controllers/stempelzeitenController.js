const { allAsync, getAsync, runAsync } = require('../utils/dbHelper');
const { broadcastEvent } = require('../utils/websocket');
const ArbeitszeitenModel = require('../models/arbeitszeitenModel');

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
          'unbekannt'  AS person_typ,
          0            AS person_id,
          '— Nicht zugeordnet —' AS person_name
        FROM termine_arbeiten ta
        JOIN termine t ON ta.termin_id = t.id
        WHERE t.datum = ?
          AND ta.mitarbeiter_id IS NULL
          AND ta.lehrling_id IS NULL
          AND (ta.stempel_start IS NOT NULL OR ta.stempel_ende IS NOT NULL)

        ORDER BY person_name, termin_id, reihenfolge
      `, [datum, datum, datum]);

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
      const { termin_id, arbeit_name, stempel_start, stempel_ende, person_id, person_typ } = req.body;

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
      let result = await runAsync(
        `UPDATE termine_arbeiten SET ${updates.join(', ')} WHERE termin_id = ? AND arbeit = ?`,
        values
      );

      // Kein Treffer: Termin existiert aber hat noch keine termine_arbeiten-Zeile
      // → auto-anlegen aus termine-Daten, dann erneut updaten
      if (result.changes === 0) {
        const termin = await getAsync(
          `SELECT id, arbeit, mitarbeiter_id, lehrling_id, geschaetzte_zeit FROM termine WHERE id = ?`,
          [termin_id]
        );
        if (!termin) {
          return res.status(404).json({ error: 'Termin nicht gefunden' });
        }
        // Person-ID aus Request bevorzugen (Intern Tab kennt den Kontext)
        // Fallback auf termin.mitarbeiter_id / lehrling_id
        const mitarbeiterId = (person_typ === 'mitarbeiter' && person_id) ? person_id
          : (person_typ !== 'lehrling' ? termin.mitarbeiter_id || null : null);
        const lehrlingId = (person_typ === 'lehrling' && person_id) ? person_id
          : (!person_typ ? termin.lehrling_id || null : null);
        await runAsync(
          `INSERT OR IGNORE INTO termine_arbeiten (termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id, reihenfolge)
           VALUES (?, ?, ?, ?, ?, 0)`,
          [termin_id, arbeit_name, termin.geschaetzte_zeit || 1, mitarbeiterId, lehrlingId]
        );
        result = await runAsync(
          `UPDATE termine_arbeiten SET ${updates.join(', ')} WHERE termin_id = ? AND arbeit = ?`,
          values
        );
      }

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Arbeit nicht gefunden' });
      }

      broadcastEvent('stempel.updated', { termin_id, arbeit_name });

      // Wenn stempel_ende gesetzt wurde: Lernlogik triggern
      if (stempel_ende !== undefined) {
        const row = await getAsync(
          `SELECT ta.stempel_start, ta.stempel_ende, ta.zeit AS geschaetzte_min,
                  t.datum, t.mitarbeiter_id
           FROM termine_arbeiten ta
           JOIN termine t ON ta.termin_id = t.id
           WHERE ta.termin_id = ? AND ta.arbeit = ?`,
          [termin_id, arbeit_name]
        );
        if (row && row.stempel_start && row.stempel_ende) {
          const istMin = StempelzeitenController._diffMinuten(row.stempel_start, row.stempel_ende);
          if (istMin > 0) {
            // 1. arbeitszeiten: Standardzeit gewichtet aktualisieren
            try {
              await ArbeitszeitenModel.updateByBezeichnung(arbeit_name, istMin);
            } catch (e) {
              console.warn('[Stempel-Lernen] arbeitszeiten update fehlgeschlagen:', e.message);
            }
            // 2. ki_zeitlern_daten: Lernpunkt eintragen
            try {
              const EinstellungenModel = require('../models/einstellungenModel');
              const einst = await EinstellungenModel.getWerkstatt();
              const kiAktiv = einst ? (einst.ki_zeitlern_enabled === 0 ? false : true) : true;
              if (kiAktiv) {
                const { kategorisiereArbeit } = require('../services/localAiService');
                const { runAsync: dbRun } = require('../config/database');
                const kat = kategorisiereArbeit(arbeit_name);
                await dbRun(
                  `INSERT INTO ki_zeitlern_daten (termin_id, arbeit, kategorie, geschaetzte_min, tatsaechliche_min, mitarbeiter_id, datum)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [termin_id, arbeit_name, kat, row.geschaetzte_min || istMin, istMin, row.mitarbeiter_id || null, row.datum]
                );
              }
            } catch (e) {
              console.warn('[Stempel-Lernen] ki_zeitlern_daten insert fehlgeschlagen:', e.message);
            }
          }
        }
      }

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
