const ArbeitszeitenPlanModel = require('../models/arbeitszeitenPlanModel');

class ArbeitszeitenPlanController {
  /**
   * GET /api/arbeitszeiten-plan
   * Gibt alle Arbeitszeitenmuster zurück
   */
  static async getAll(req, res) {
    try {
      const rows = await ArbeitszeitenPlanModel.getAll();
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/arbeitszeiten-plan/mitarbeiter/:id
   * Gibt alle Arbeitszeitenmuster für einen Mitarbeiter zurück
   */
  static async getByMitarbeiterId(req, res) {
    try {
      const { id } = req.params;
      const rows = await ArbeitszeitenPlanModel.getByMitarbeiterId(id);
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/arbeitszeiten-plan/lehrling/:id
   * Gibt alle Arbeitszeitenmuster für einen Lehrling zurück
   */
  static async getByLehrlingId(req, res) {
    try {
      const { id } = req.params;
      const rows = await ArbeitszeitenPlanModel.getByLehrlingId(id);
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/arbeitszeiten-plan/for-date?mitarbeiter_id=X&datum=YYYY-MM-DD
   * oder /api/arbeitszeiten-plan/for-date?lehrling_id=X&datum=YYYY-MM-DD
   * Berechnet effektive Arbeitszeit für ein spezifisches Datum
   */
  static async getForDate(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, datum } = req.query;

      if (!datum) {
        return res.status(400).json({ error: 'Parameter "datum" ist erforderlich' });
      }

      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'Entweder "mitarbeiter_id" oder "lehrling_id" ist erforderlich' });
      }

      const result = await ArbeitszeitenPlanModel.getForDate(
        mitarbeiter_id ? parseInt(mitarbeiter_id) : null,
        lehrling_id ? parseInt(lehrling_id) : null,
        datum
      );

      res.json(result || { message: 'Kein spezifischer Eintrag, nutze Standard-Wochenarbeitszeit' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/arbeitszeiten-plan/range?mitarbeiter_id=X&datum_von=...&datum_bis=...
   * Gibt Arbeitszeitenmuster für einen Datumsbereich zurück
   */
  static async getByDateRange(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, datum_von, datum_bis } = req.query;

      if (!datum_von || !datum_bis) {
        return res.status(400).json({ error: 'Parameter "datum_von" und "datum_bis" sind erforderlich' });
      }

      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'Entweder "mitarbeiter_id" oder "lehrling_id" ist erforderlich' });
      }

      const rows = await ArbeitszeitenPlanModel.getByDateRange(
        mitarbeiter_id ? parseInt(mitarbeiter_id) : null,
        lehrling_id ? parseInt(lehrling_id) : null,
        datum_von,
        datum_bis
      );

      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/arbeitszeiten-plan/muster
   * Erstellt oder aktualisiert ein Wochentag-Muster
   */
  static async upsertWochentagMuster(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, wochentag, arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung } = req.body;

      // Validierung
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'Entweder mitarbeiter_id oder lehrling_id muss angegeben werden' });
      }

      if (mitarbeiter_id && lehrling_id) {
        return res.status(400).json({ error: 'Nur mitarbeiter_id ODER lehrling_id, nicht beide' });
      }

      if (!wochentag || wochentag < 1 || wochentag > 7) {
        return res.status(400).json({ error: 'Wochentag muss zwischen 1 (Mo) und 7 (So) liegen' });
      }

      if (arbeitsstunden === undefined || arbeitsstunden < 0 || arbeitsstunden > 24) {
        return res.status(400).json({ error: 'Arbeitsstunden muss zwischen 0 und 24 liegen' });
      }

      if (pausenzeit_minuten !== undefined && (pausenzeit_minuten < 0 || pausenzeit_minuten > 120)) {
        return res.status(400).json({ error: 'Pausenzeit muss zwischen 0 und 120 Minuten liegen' });
      }

      const result = await ArbeitszeitenPlanModel.upsertWochentagMuster(req.body);

      res.json({
        message: result.changes > 0 ? 'Wochentag-Muster aktualisiert' : 'Wochentag-Muster erstellt',
        id: result.id,
        changes: result.changes
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/arbeitszeiten-plan/datum
   * Erstellt einen spezifischen Datumseintrag (nur Zukunft)
   */
  static async createDateEntry(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, datum_von, datum_bis, arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung } = req.body;

      // Validierung
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'Entweder mitarbeiter_id oder lehrling_id muss angegeben werden' });
      }

      if (mitarbeiter_id && lehrling_id) {
        return res.status(400).json({ error: 'Nur mitarbeiter_id ODER lehrling_id, nicht beide' });
      }

      if (!datum_von) {
        return res.status(400).json({ error: 'datum_von ist erforderlich' });
      }

      if (arbeitsstunden === undefined || arbeitsstunden < 0 || arbeitsstunden > 24) {
        return res.status(400).json({ error: 'Arbeitsstunden muss zwischen 0 und 24 liegen' });
      }

      const result = await ArbeitszeitenPlanModel.createDateEntry(req.body);

      res.json({
        message: 'Datumseintrag erstellt',
        id: result.id
      });
    } catch (err) {
      if (err.message.includes('Zukunft')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * PUT /api/arbeitszeiten-plan/:id
   * Aktualisiert einen Eintrag (nur Zukunft)
   */
  static async update(req, res) {
    try {
      const { id } = req.params;

      const result = await ArbeitszeitenPlanModel.update(id, req.body);

      res.json({
        message: 'Eintrag aktualisiert',
        changes: result.changes
      });
    } catch (err) {
      if (err.message.includes('nicht gefunden') || err.message.includes('Historische')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * DELETE /api/arbeitszeiten-plan/:id
   * Löscht einen Eintrag
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await ArbeitszeitenPlanModel.delete(id);

      res.json({
        message: 'Eintrag gelöscht',
        changes: result.changes
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * DELETE /api/arbeitszeiten-plan/reset/mitarbeiter/:id
   * oder /api/arbeitszeiten-plan/reset/lehrling/:id
   * Löscht alle Wochentag-Muster für eine Person (Reset auf Standard)
   */
  static async resetToStandard(req, res) {
    try {
      const { typ, id } = req.params;

      const mitarbeiter_id = typ === 'mitarbeiter' ? id : null;
      const lehrling_id = typ === 'lehrling' ? id : null;

      const result = await ArbeitszeitenPlanModel.deleteAllMusterForPerson(mitarbeiter_id, lehrling_id);

      res.json({
        message: `${result.changes} Wochentag-Muster gelöscht. Person nutzt jetzt Standard-Wochenarbeitszeit.`,
        changes: result.changes
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/arbeitszeiten-plan/:id
   * Gibt einen einzelnen Eintrag zurück
   */
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const row = await ArbeitszeitenPlanModel.getById(id);

      if (!row) {
        return res.status(404).json({ error: 'Eintrag nicht gefunden' });
      }

      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = ArbeitszeitenPlanController;
