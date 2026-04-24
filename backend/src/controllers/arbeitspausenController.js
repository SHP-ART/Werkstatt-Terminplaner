/**
 * Arbeitspausen Controller
 *
 * Verwaltet manuelle Arbeitsunterbrechungen für laufende Werkstattaufträge:
 * - Pause starten mit Grundangabe (teil_fehlt, rueckfrage_kunde, vorrang)
 * - Pause manuell beenden (kein automatischer Ablauf)
 * - Aktive Pausen abfragen
 */
const { db } = require('../config/database');

const ERLAUBTE_GRUENDE = ['teil_fehlt', 'rueckfrage_kunde', 'vorrang'];

class ArbeitspausenController {
  static dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
  }

  static dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
  }

  static dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
    });
  }

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

      const termin = await ArbeitspausenController.dbGet(
        `SELECT id, status FROM termine WHERE id = ? AND geloescht_am IS NULL`,
        [termin_id]
      );

      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      if (termin.status !== 'in_arbeit') {
        return res.status(409).json({ error: 'Termin ist nicht in Arbeit' });
      }

      const aktivePause = await ArbeitspausenController.dbGet(
        `SELECT id FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`,
        [termin_id]
      );

      if (aktivePause) {
        return res.status(409).json({ error: 'Arbeitspause läuft bereits' });
      }

      const result = await ArbeitspausenController.dbRun(
        `INSERT INTO arbeitspausen (termin_id, mitarbeiter_id, lehrling_id, grund, gestartet_am)
         VALUES (?, ?, ?, ?, ?)`,
        [termin_id, mitarbeiter_id || null, lehrling_id || null, grund, new Date().toISOString()]
      );

      res.json({ success: true, id: result.lastID });
    } catch (error) {
      console.error('[Arbeitspause-Start] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Starten der Arbeitspause', details: error.message });
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

      const aktivePause = await ArbeitspausenController.dbGet(
        `SELECT id, gestartet_am FROM arbeitspausen WHERE termin_id = ? AND beendet_am IS NULL`,
        [termin_id]
      );

      if (!aktivePause) {
        return res.status(404).json({ error: 'Keine aktive Arbeitspause für diesen Termin' });
      }

      // Wenn die Pause weniger als 5 Sekunden gedauert hat, war es vermutlich
      // ein Fehlklick → komplett löschen statt 0-Min-Eintrag zu speichern.
      const startMs = aktivePause.gestartet_am ? Date.parse(aktivePause.gestartet_am) : NaN;
      const dauerMs = !isNaN(startMs) ? Date.now() - startMs : null;
      if (dauerMs !== null && dauerMs < 5000) {
        await ArbeitspausenController.dbRun(
          `DELETE FROM arbeitspausen WHERE id = ?`,
          [aktivePause.id]
        );
        return res.json({ success: true, deleted: true, reason: 'kurzklick' });
      }

      await ArbeitspausenController.dbRun(
        `UPDATE arbeitspausen SET beendet_am = ? WHERE id = ?`,
        [new Date().toISOString(), aktivePause.id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[Arbeitspause-Ende] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Beenden der Arbeitspause', details: error.message });
    }
  }

  /**
   * GET /api/arbeitspausen/termin/:termin_id
   * Gibt alle Arbeitspausen für einen Termin zurück
   */
  static async getByTermin(req, res) {
    try {
      const { termin_id } = req.params;
      const pausen = await ArbeitspausenController.dbAll(
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
   * Gibt alle Arbeitspausen zurück bei denen beendet_am IS NULL
   */
  static async getAktive(req, res) {
    try {
      const pausen = await ArbeitspausenController.dbAll(
        `SELECT id, termin_id, mitarbeiter_id, lehrling_id, grund, gestartet_am
         FROM arbeitspausen
         WHERE beendet_am IS NULL
         ORDER BY gestartet_am DESC`
      );
      res.json(pausen);
    } catch (error) {
      console.error('[Arbeitspausen-Aktive] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Arbeitspausen', details: error.message });
    }
  }
}

module.exports = ArbeitspausenController;
