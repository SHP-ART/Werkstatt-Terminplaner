const { allAsync, getAsync, runAsync } = require('../utils/dbHelper');

class WiederkehrendeTermineController {

  static async getAll(req, res) {
    try {
      const termine = await allAsync(
        `SELECT * FROM wiederkehrende_termine ORDER BY naechste_erstellung ASC`,
        []
      );
      res.json({ success: true, termine });
    } catch (err) {
      console.error('WiederkehrendeTermine getAll:', err);
      res.status(500).json({ error: 'Datenbankfehler' });
    }
  }

  static async create(req, res) {
    try {
      const {
        kunde_id = null,
        kunde_name,
        kennzeichen = '',
        arbeit,
        geschaetzte_zeit = 60,
        wiederholung = 'halbjahr',
        naechste_erstellung,
      } = req.body;

      if (!kunde_name || !arbeit) {
        return res.status(400).json({ error: 'kunde_name und arbeit sind Pflicht' });
      }

      const result = await runAsync(
        `INSERT INTO wiederkehrende_termine
           (kunde_id, kunde_name, kennzeichen, arbeit, geschaetzte_zeit, wiederholung, naechste_erstellung, aktiv)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [kunde_id, kunde_name, kennzeichen, arbeit, geschaetzte_zeit, wiederholung, naechste_erstellung || null]
      );
      res.status(201).json({ success: true, id: result.lastID });
    } catch (err) {
      console.error('WiederkehrendeTermine create:', err);
      res.status(500).json({ error: 'Datenbankfehler' });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const { aktiv, naechste_erstellung, arbeit, geschaetzte_zeit, wiederholung } = req.body;

      const set = [];
      const params = [];

      if (aktiv !== undefined) { set.push('aktiv = ?'); params.push(aktiv ? 1 : 0); }
      if (naechste_erstellung !== undefined) { set.push('naechste_erstellung = ?'); params.push(naechste_erstellung); }
      if (arbeit !== undefined) { set.push('arbeit = ?'); params.push(arbeit); }
      if (geschaetzte_zeit !== undefined) { set.push('geschaetzte_zeit = ?'); params.push(geschaetzte_zeit); }
      if (wiederholung !== undefined) { set.push('wiederholung = ?'); params.push(wiederholung); }

      if (set.length === 0) return res.status(400).json({ error: 'Keine Felder zum Aktualisieren' });

      params.push(id);
      await runAsync(`UPDATE wiederkehrende_termine SET ${set.join(', ')} WHERE id = ?`, params);
      res.json({ success: true });
    } catch (err) {
      console.error('WiederkehrendeTermine update:', err);
      res.status(500).json({ error: 'Datenbankfehler' });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await runAsync('DELETE FROM wiederkehrende_termine WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('WiederkehrendeTermine delete:', err);
      res.status(500).json({ error: 'Datenbankfehler' });
    }
  }

  /**
   * Scheduler: Prüft täglich ob fällige wiederkehrende Termine angelegt werden müssen.
   * Erstellt schwebende Termine und verschiebt naechste_erstellung.
   */
  static async runScheduler() {
    try {
      const heute = new Date().toISOString().split('T')[0];
      const faellige = await allAsync(
        `SELECT * FROM wiederkehrende_termine WHERE aktiv = 1 AND naechste_erstellung <= ?`,
        [heute]
      );

      for (const wt of faellige) {
        // Schwebenden Termin anlegen
        await runAsync(
          `INSERT INTO termine (kunde_name, kennzeichen, arbeit, geschaetzte_zeit, ist_schwebend, status, datum, erstellt_am)
           VALUES (?, ?, ?, ?, 1, 'geplant', ?, CURRENT_TIMESTAMP)`,
          [wt.kunde_name, wt.kennzeichen, wt.arbeit, wt.geschaetzte_zeit, heute]
        );

        // Nächstes Erstellungsdatum berechnen
        const naechste = WiederkehrendeTermineController._naechstesDatum(heute, wt.wiederholung);
        await runAsync(
          `UPDATE wiederkehrende_termine SET naechste_erstellung = ? WHERE id = ?`,
          [naechste, wt.id]
        );

        // Automation-Log Eintrag
        try {
          const { logAction } = require('../models/automationLogModel');
          await logAction('wiederkehrender_termin', `Schwebender Termin für "${wt.kunde_name}" (${wt.arbeit}) automatisch erstellt`, null, 'ok');
        } catch (e) { /* ignorieren */ }

        console.log(`[WiederkehrendeTermine] Schwebender Termin für "${wt.kunde_name}" erstellt, nächste: ${naechste}`);
      }
    } catch (err) {
      console.error('[WiederkehrendeTermine] Scheduler-Fehler:', err);
    }
  }

  static _naechstesDatum(von, wiederholung) {
    const d = new Date(von);
    switch (wiederholung) {
      case 'monatlich': d.setMonth(d.getMonth() + 1); break;
      case 'quartal':   d.setMonth(d.getMonth() + 3); break;
      case 'halbjahr':  d.setMonth(d.getMonth() + 6); break;
      case 'jaehrlich': d.setFullYear(d.getFullYear() + 1); break;
      default:          d.setMonth(d.getMonth() + 6);
    }
    return d.toISOString().split('T')[0];
  }
}

module.exports = WiederkehrendeTermineController;
