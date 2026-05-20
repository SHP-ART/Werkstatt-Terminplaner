/**
 * Arbeitspausen Controller
 *
 * Verwaltet manuelle Arbeitsunterbrechungen fuer laufende Werkstattauftraege.
 * Eine aktive Arbeitspause setzt den Termin auf "unterbrochen", ohne den
 * Arbeitsstempel zu schliessen. Stempelzeiten ziehen die Pause dadurch sauber ab.
 */

const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');
const { withTransaction } = require('../utils/transaction');
const { broadcastEvent } = require('../utils/websocket');

const ERLAUBTE_GRUENDE = ['teil_fehlt', 'rueckfrage_kunde', 'vorrang', 'sonstiges'];

function jetztIso() {
  return new Date().toISOString();
}

function lokaleZeitHHMM(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function lokaleDatumYYYYMMDD(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDetails(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function getDetailPerson(details, isLehrling) {
  const key = isLehrling ? '_gesamt_lehrling_id' : '_gesamt_mitarbeiter_id';
  const value = details && details[key] != null ? Number(details[key]) : null;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getTerminPerson(termin) {
  const details = parseDetails(termin.arbeitszeiten_details);
  return {
    mitarbeiterId: termin.mitarbeiter_id || getDetailPerson(details, false),
    lehrlingId: termin.lehrling_id || getDetailPerson(details, true)
  };
}

function isTerminFuerPerson(termin, mitarbeiterId, lehrlingId) {
  const person = getTerminPerson(termin);
  if (mitarbeiterId) return Number(person.mitarbeiterId) === Number(mitarbeiterId);
  if (lehrlingId) return Number(person.lehrlingId) === Number(lehrlingId);
  return false;
}

function sortZeit(termin) {
  const details = parseDetails(termin.arbeitszeiten_details);
  return termin.startzeit || details._startzeit || termin.bring_zeit || '23:59';
}

async function ladeTermin(terminId) {
  return getAsync(
    `SELECT id, termin_nr, kunde_name, kennzeichen, arbeit, status, datum, startzeit,
            bring_zeit, geschaetzte_zeit, mitarbeiter_id, lehrling_id,
            arbeitszeiten_details, interne_auftragsnummer
       FROM termine
      WHERE id = ? AND geloescht_am IS NULL`,
    [terminId]
  );
}

async function findeNaechstenTermin(termin) {
  const person = getTerminPerson(termin);
  const datum = termin.datum || lokaleDatumYYYYMMDD();
  const kandidaten = await allAsync(
    `SELECT id, termin_nr, kunde_name, kennzeichen, arbeit, status, datum, startzeit,
            bring_zeit, geschaetzte_zeit, mitarbeiter_id, lehrling_id,
            arbeitszeiten_details, interne_auftragsnummer
       FROM termine
      WHERE datum = ?
        AND geloescht_am IS NULL
        AND id <> ?
        AND status IN ('geplant', 'offen', 'wartend')`,
    [datum, termin.id]
  );

  return kandidaten
    .filter(k => isTerminFuerPerson(k, person.mitarbeiterId, person.lehrlingId))
    .sort((a, b) => {
      const zeitCompare = sortZeit(a).localeCompare(sortZeit(b));
      return zeitCompare !== 0 ? zeitCompare : Number(a.id) - Number(b.id);
    })[0] || null;
}

async function findeAktivenTerminFuerPerson(termin) {
  const person = getTerminPerson(termin);
  const datum = termin.datum || lokaleDatumYYYYMMDD();
  const kandidaten = await allAsync(
    `SELECT id, termin_nr, kunde_name, kennzeichen, arbeit, status, datum, startzeit,
            bring_zeit, geschaetzte_zeit, mitarbeiter_id, lehrling_id, arbeitszeiten_details
       FROM termine
      WHERE datum = ?
        AND geloescht_am IS NULL
        AND id <> ?
        AND status = 'in_arbeit'`,
    [datum, termin.id]
  );

  return kandidaten.find(k => isTerminFuerPerson(k, person.mitarbeiterId, person.lehrlingId)) || null;
}

async function ensureArbeitsstempelOffen(termin, mitarbeiterId, lehrlingId) {
  const details = parseDetails(termin.arbeitszeiten_details);
  const stempelStart = termin.startzeit || details._startzeit || termin.bring_zeit || lokaleZeitHHMM();
  const arbeiten = await allAsync(
    `SELECT id, arbeit, stempel_start, stempel_ende, mitarbeiter_id, lehrling_id
       FROM termine_arbeiten
      WHERE termin_id = ?
      ORDER BY reihenfolge ASC, id ASC`,
    [termin.id]
  );

  const personMatch = a =>
    (mitarbeiterId && Number(a.mitarbeiter_id) === Number(mitarbeiterId)) ||
    (lehrlingId && Number(a.lehrling_id) === Number(lehrlingId));
  const zielArbeit = arbeiten.find(personMatch) || arbeiten.find(a => !a.stempel_ende) || arbeiten[0];

  if (zielArbeit) {
    const updates = [];
    const params = [];
    if (!zielArbeit.stempel_start) {
      updates.push('stempel_start = ?');
      params.push(stempelStart);
    }
    if (mitarbeiterId && !zielArbeit.mitarbeiter_id) {
      updates.push('mitarbeiter_id = ?');
      params.push(mitarbeiterId);
    }
    if (lehrlingId && !zielArbeit.lehrling_id) {
      updates.push('lehrling_id = ?');
      params.push(lehrlingId);
    }
    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(zielArbeit.id);
      await runAsync(`UPDATE termine_arbeiten SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    return;
  }

  await runAsync(
    `INSERT INTO termine_arbeiten
       (termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id, reihenfolge, stempel_start)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [
      termin.id,
      termin.arbeit || 'Arbeit',
      Number(termin.geschaetzte_zeit) || 0,
      mitarbeiterId || null,
      lehrlingId || null,
      stempelStart
    ]
  );
}

async function aktualisiereDetailsStartzeit(terminId, detailsRaw, startzeit) {
  const details = parseDetails(detailsRaw);
  details._startzeit = startzeit;
  await runAsync(
    `UPDATE termine
        SET arbeitszeiten_details = ?
      WHERE id = ?`,
    [JSON.stringify(details), terminId]
  );
}

class ArbeitspausenController {
  /**
   * POST /api/arbeitspausen/starten
   * Body: { termin_id, mitarbeiter_id?, lehrling_id?, grund }
   */
  static async starten(req, res) {
    try {
      const { termin_id, mitarbeiter_id, lehrling_id, grund } = req.body;

      if (!termin_id || !grund) {
        return res.status(400).json({ error: 'termin_id und grund erforderlich' });
      }

      if (!ERLAUBTE_GRUENDE.includes(grund)) {
        return res.status(400).json({ error: `grund muss einer von: ${ERLAUBTE_GRUENDE.join(', ')}` });
      }

      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const result = await withTransaction(async () => {
        const termin = await ladeTermin(termin_id);

        if (!termin) {
          const error = new Error('Termin nicht gefunden');
          error.status = 404;
          throw error;
        }

        if (termin.status !== 'in_arbeit') {
          const error = new Error('Termin ist nicht in Arbeit');
          error.status = 409;
          throw error;
        }

        const aktivePause = await getAsync(
          `SELECT id FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`,
          [termin_id]
        );

        if (aktivePause) {
          const error = new Error('Arbeitspause laeuft bereits');
          error.status = 409;
          throw error;
        }

        await ensureArbeitsstempelOffen(termin, mitarbeiter_id || null, lehrling_id || null);

        const pause = await runAsync(
          `INSERT INTO arbeitspausen (termin_id, mitarbeiter_id, lehrling_id, grund, gestartet_am)
           VALUES (?, ?, ?, ?, ?)`,
          [termin_id, mitarbeiter_id || null, lehrling_id || null, grund, jetztIso()]
        );

        await runAsync(
          `UPDATE termine
              SET status = 'unterbrochen',
                  unterbrochen_am = ?,
                  unterbrochen_grund = ?
            WHERE id = ?`,
          [jetztIso(), grund, termin_id]
        );

        const aktualisierterTermin = await ladeTermin(termin_id);
        const naechsterTermin = await findeNaechstenTermin(termin);
        return { pauseId: pause.lastID, termin: aktualisierterTermin, naechsterTermin };
      });

      broadcastEvent('termin.updated', { termin_id: Number(termin_id), status: 'unterbrochen' });
      broadcastEvent('arbeitspause.started', { termin_id: Number(termin_id), id: result.pauseId });

      res.json({
        success: true,
        id: result.pauseId,
        termin: result.termin,
        naechsterTermin: result.naechsterTermin
      });
    } catch (error) {
      console.error('[Arbeitspause-Start] Fehler:', error);
      res.status(error.status || 500).json({
        error: error.status ? error.message : 'Fehler beim Starten der Arbeitspause',
        details: error.status ? undefined : error.message
      });
    }
  }

  /**
   * POST /api/arbeitspausen/beenden
   * Body: { termin_id }
   */
  static async beenden(req, res) {
    try {
      const { termin_id } = req.body;

      if (!termin_id) {
        return res.status(400).json({ error: 'termin_id erforderlich' });
      }

      const startzeit = lokaleZeitHHMM();
      const result = await withTransaction(async () => {
        const termin = await ladeTermin(termin_id);
        if (!termin) {
          const error = new Error('Termin nicht gefunden');
          error.status = 404;
          throw error;
        }

        const aktivePause = await getAsync(
          `SELECT id, gestartet_am FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`,
          [termin_id]
        );

        if (!aktivePause) {
          const error = new Error('Keine aktive Arbeitspause fuer diesen Termin');
          error.status = 404;
          throw error;
        }

        const aktiverTermin = await findeAktivenTerminFuerPerson(termin);
        if (aktiverTermin) {
          const error = new Error('Erst den aktuellen Auftrag pausieren, bevor ein unterbrochener Auftrag fortgesetzt wird');
          error.status = 409;
          throw error;
        }

        const startMs = aktivePause.gestartet_am ? Date.parse(aktivePause.gestartet_am) : NaN;
        const dauerMs = !Number.isNaN(startMs) ? Date.now() - startMs : null;
        if (dauerMs !== null && dauerMs < 5000) {
          await runAsync(`DELETE FROM arbeitspausen WHERE id = ?`, [aktivePause.id]);
        } else {
          await runAsync(
            `UPDATE arbeitspausen SET beendet_am = ? WHERE id = ?`,
            [jetztIso(), aktivePause.id]
          );
        }

        await runAsync(
          `UPDATE termine
              SET status = 'in_arbeit',
                  startzeit = ?,
                  unterbrochen_am = NULL,
                  unterbrochen_grund = NULL
            WHERE id = ?`,
          [startzeit, termin_id]
        );
        await aktualisiereDetailsStartzeit(termin_id, termin.arbeitszeiten_details, startzeit);

        const aktualisierterTermin = await ladeTermin(termin_id);
        return { termin: aktualisierterTermin, deleted: dauerMs !== null && dauerMs < 5000 };
      });

      broadcastEvent('termin.updated', { termin_id: Number(termin_id), status: 'in_arbeit' });
      broadcastEvent('arbeitspause.ended', { termin_id: Number(termin_id) });

      res.json({ success: true, deleted: result.deleted, termin: result.termin });
    } catch (error) {
      console.error('[Arbeitspause-Ende] Fehler:', error);
      res.status(error.status || 500).json({
        error: error.status ? error.message : 'Fehler beim Beenden der Arbeitspause',
        details: error.status ? undefined : error.message
      });
    }
  }

  /**
   * GET /api/arbeitspausen/termin/:termin_id
   */
  static async getByTermin(req, res) {
    try {
      const { termin_id } = req.params;
      const pausen = await allAsync(
        `SELECT id, termin_id, mitarbeiter_id, lehrling_id, grund, gestartet_am, beendet_am
           FROM arbeitspausen
          WHERE termin_id = ?
          ORDER BY gestartet_am ASC`,
        [termin_id]
      );
      res.json(pausen);
    } catch (error) {
      console.error('[Arbeitspausen-Termin] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Arbeitspausen', details: error.message });
    }
  }

  /**
   * GET /api/arbeitspausen/aktive
   */
  static async getAktive(req, res) {
    try {
      const pausen = await allAsync(
        `SELECT ap.id, ap.termin_id, ap.mitarbeiter_id, ap.lehrling_id, ap.grund, ap.gestartet_am,
                t.termin_nr, t.kunde_name, t.kennzeichen, t.arbeit, t.status, t.datum, t.startzeit,
                t.bring_zeit, t.geschaetzte_zeit, t.arbeitszeiten_details, t.interne_auftragsnummer,
                t.mitarbeiter_id AS termin_mitarbeiter_id, t.lehrling_id AS termin_lehrling_id
           FROM arbeitspausen ap
           JOIN termine t ON t.id = ap.termin_id
          WHERE ap.beendet_am IS NULL
            AND t.geloescht_am IS NULL
          ORDER BY ap.gestartet_am DESC`
      );
      res.json(pausen);
    } catch (error) {
      console.error('[Arbeitspausen-Aktive] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Arbeitspausen', details: error.message });
    }
  }
}

module.exports = ArbeitspausenController;
