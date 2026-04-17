const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');
const { broadcastEvent } = require('../utils/websocket');

function getJetztZeit() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

function getHeuteDatum() {
  return new Date().toISOString().slice(0, 10);
}

class TagesstempelController {

  /**
   * POST /api/tagesstempel/kommen
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Setzt kommen_zeit auf aktuelle Uhrzeit. Idempotent: zweiter Aufruf hat keinen Effekt.
   */
  static async kommen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      if (mitarbeiter_id) {
        const existing = await getAsync(
          `SELECT id, kommen_zeit FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`,
          [mitarbeiter_id, datum]
        );
        if (existing) {
          return res.json({ success: true, message: 'Bereits gestempelt', zeit: existing.kommen_zeit });
        }
        await runAsync(
          `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, erstellt_am) VALUES (?, ?, ?, datetime('now'))`,
          [mitarbeiter_id, datum, zeit]
        );
      } else {
        const existing = await getAsync(
          `SELECT id, kommen_zeit FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`,
          [lehrling_id, datum]
        );
        if (existing) {
          return res.json({ success: true, message: 'Bereits gestempelt', zeit: existing.kommen_zeit });
        }
        await runAsync(
          `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, erstellt_am) VALUES (?, ?, ?, datetime('now'))`,
          [lehrling_id, datum, zeit]
        );
      }

      broadcastEvent('tagesstempel.kommen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum, zeit });
      res.json({ success: true, zeit });
    } catch (err) {
      console.error('[Tagesstempel-Kommen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/gehen
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Prüft laufende Aufträge – gibt diese zurück wenn vorhanden (Frontend zeigt Dialog).
   * Ohne laufende Aufträge: direkt speichern.
   */
  static async gehen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();

      let laufendeTermine = [];
      if (mitarbeiter_id) {
        laufendeTermine = await allAsync(
          `SELECT id, termin_nr, kennzeichen, kunde_name, arbeit FROM termine
           WHERE datum = ? AND mitarbeiter_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
          [datum, mitarbeiter_id]
        );
      } else {
        laufendeTermine = await allAsync(
          `SELECT id, termin_nr, kennzeichen, kunde_name, arbeit FROM termine
           WHERE datum = ? AND lehrling_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
          [datum, lehrling_id]
        );
      }

      if (laufendeTermine.length > 0) {
        return res.json({
          success: false,
          bestaetigung_erforderlich: true,
          laufende_termine: laufendeTermine
        });
      }

      await TagesstempelController._setzeGehenZeit(mitarbeiter_id, lehrling_id, datum);
      broadcastEvent('tagesstempel.gehen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, zeit: getJetztZeit() });
    } catch (err) {
      console.error('[Tagesstempel-Gehen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/gehen/bestaetigen
   * Body: { mitarbeiter_id?, lehrling_id?, termine_verschieben: boolean }
   * Setzt gehen_zeit. Wenn termine_verschieben=true: alle in_arbeit-Termine auf nächsten Tag.
   */
  static async gehenBestaetigen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, termine_verschieben } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const morgen = new Date();
      morgen.setDate(morgen.getDate() + 1);
      const morgenStr = morgen.toISOString().slice(0, 10);

      if (termine_verschieben) {
        let laufendeIds = [];
        if (mitarbeiter_id) {
          const rows = await allAsync(
            `SELECT id FROM termine WHERE datum = ? AND mitarbeiter_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
            [datum, mitarbeiter_id]
          );
          laufendeIds = rows.map(r => r.id);
        } else {
          const rows = await allAsync(
            `SELECT id FROM termine WHERE datum = ? AND lehrling_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
            [datum, lehrling_id]
          );
          laufendeIds = rows.map(r => r.id);
        }

        for (const id of laufendeIds) {
          await runAsync(
            `UPDATE termine SET datum = ?, status = 'wartend' WHERE id = ?`,
            [morgenStr, id]
          );
          broadcastEvent('termin.updated', { id, datum, newDatum: morgenStr });
        }
      }

      await TagesstempelController._setzeGehenZeit(mitarbeiter_id, lehrling_id, datum);
      broadcastEvent('tagesstempel.gehen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, zeit: getJetztZeit(), verschoben: termine_verschieben || false });
    } catch (err) {
      console.error('[Tagesstempel-GehenBestaetigen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  static async _setzeGehenZeit(mitarbeiter_id, lehrling_id, datum) {
    const zeit = getJetztZeit();
    if (mitarbeiter_id) {
      const existing = await getAsync(
        `SELECT id FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`,
        [mitarbeiter_id, datum]
      );
      if (existing) {
        await runAsync(`UPDATE tagesstempel SET gehen_zeit = ? WHERE mitarbeiter_id = ? AND datum = ?`, [zeit, mitarbeiter_id, datum]);
      } else {
        await runAsync(
          `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, erstellt_am) VALUES (?, ?, ?, ?, datetime('now'))`,
          [mitarbeiter_id, datum, zeit, zeit]
        );
      }
    } else {
      const existing = await getAsync(
        `SELECT id FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`,
        [lehrling_id, datum]
      );
      if (existing) {
        await runAsync(`UPDATE tagesstempel SET gehen_zeit = ? WHERE lehrling_id = ? AND datum = ?`, [zeit, lehrling_id, datum]);
      } else {
        await runAsync(
          `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, gehen_zeit, erstellt_am) VALUES (?, ?, ?, ?, datetime('now'))`,
          [lehrling_id, datum, zeit, zeit]
        );
      }
    }
  }

  /**
   * GET /api/tagesstempel?datum=YYYY-MM-DD
   * Gibt alle Tagesstempel + Arbeitsunterbrechungen für ein Datum zurück.
   */
  static async getByDatum(req, res) {
    try {
      const datum = req.query.datum || getHeuteDatum();

      const stempel = await allAsync(
        `SELECT ts.id, ts.mitarbeiter_id, ts.lehrling_id, ts.datum,
                ts.kommen_zeit, ts.gehen_zeit,
                m.name AS mitarbeiter_name, l.name AS lehrling_name
         FROM tagesstempel ts
         LEFT JOIN mitarbeiter m ON ts.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON ts.lehrling_id = l.id
         WHERE ts.datum = ?
         ORDER BY ts.kommen_zeit`,
        [datum]
      );

      const unterbrechungen = await allAsync(
        `SELECT au.id, au.mitarbeiter_id, au.lehrling_id, au.datum,
                au.start_zeit, au.ende_zeit,
                m.name AS mitarbeiter_name, l.name AS lehrling_name
         FROM arbeitsunterbrechungen au
         LEFT JOIN mitarbeiter m ON au.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON au.lehrling_id = l.id
         WHERE au.datum = ?
         ORDER BY au.start_zeit`,
        [datum]
      );

      res.json({ stempel, unterbrechungen });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/unterbrechung/start
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Öffnet eine neue Arbeitsunterbrechung (Ende noch offen).
   */
  static async unterbrechungStart(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      const result = await runAsync(
        `INSERT INTO arbeitsunterbrechungen (mitarbeiter_id, lehrling_id, datum, start_zeit, erstellt_am) VALUES (?, ?, ?, ?, datetime('now'))`,
        [mitarbeiter_id || null, lehrling_id || null, datum, zeit]
      );

      broadcastEvent('tagesstempel.unterbrechung', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, id: result.lastID, start_zeit: zeit });
    } catch (err) {
      console.error('[Unterbrechung-Start] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/unterbrechung/ende
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Schließt die offene Arbeitsunterbrechung (ende_zeit = jetzt).
   */
  static async unterbrechungEnde(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      let offene;
      if (mitarbeiter_id) {
        offene = await getAsync(
          `SELECT id FROM arbeitsunterbrechungen WHERE mitarbeiter_id = ? AND datum = ? AND ende_zeit IS NULL ORDER BY id DESC LIMIT 1`,
          [mitarbeiter_id, datum]
        );
      } else {
        offene = await getAsync(
          `SELECT id FROM arbeitsunterbrechungen WHERE lehrling_id = ? AND datum = ? AND ende_zeit IS NULL ORDER BY id DESC LIMIT 1`,
          [lehrling_id, datum]
        );
      }

      if (!offene) {
        return res.status(404).json({ error: 'Keine offene Arbeitsunterbrechung gefunden' });
      }

      await runAsync(`UPDATE arbeitsunterbrechungen SET ende_zeit = ? WHERE id = ?`, [zeit, offene.id]);
      broadcastEvent('tagesstempel.unterbrechung', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, ende_zeit: zeit });
    } catch (err) {
      console.error('[Unterbrechung-Ende] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = TagesstempelController;
