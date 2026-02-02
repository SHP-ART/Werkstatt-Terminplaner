const MitarbeiterModel = require('../models/mitarbeiterModel');

class MitarbeiterController {
  static async getAll(req, res) {
    try {
      const rows = await MitarbeiterModel.getAll();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getById(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Ungültige ID' });
    }

    try {
      const row = await MitarbeiterModel.getById(id);
      if (!row) {
        return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
      }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getAktive(req, res) {
    try {
      const rows = await MitarbeiterModel.getAktive();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    const { name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service, mittagspause_start,
            wochenarbeitszeit_stunden, arbeitstage_pro_woche, pausenzeit_minuten,
            samstag_aktiv, samstag_start, samstag_ende, samstag_pausenzeit_minuten } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    // Validierung Wochenarbeitszeit
    if (wochenarbeitszeit_stunden !== undefined && (wochenarbeitszeit_stunden < 1 || wochenarbeitszeit_stunden > 168)) {
      return res.status(400).json({ error: 'Wochenarbeitszeit muss zwischen 1 und 168 Stunden liegen' });
    }
    if (arbeitstage_pro_woche !== undefined && (arbeitstage_pro_woche < 1 || arbeitstage_pro_woche > 6)) {
      return res.status(400).json({ error: 'Arbeitstage pro Woche müssen zwischen 1 und 6 liegen' });
    }
    if (pausenzeit_minuten !== undefined && (pausenzeit_minuten < 0 || pausenzeit_minuten > 120)) {
      return res.status(400).json({ error: 'Pausenzeit muss zwischen 0 und 120 Minuten liegen' });
    }
    if (samstag_pausenzeit_minuten !== undefined && (samstag_pausenzeit_minuten < 0 || samstag_pausenzeit_minuten > 120)) {
      return res.status(400).json({ error: 'Samstag-Pausenzeit muss zwischen 0 und 120 Minuten liegen' });
    }

    const data = {
      name: name.trim(),
      arbeitsstunden_pro_tag: arbeitsstunden_pro_tag !== undefined ? parseInt(arbeitsstunden_pro_tag, 10) : 8,
      nebenzeit_prozent: nebenzeit_prozent !== undefined ? parseFloat(nebenzeit_prozent) : 0,
      aktiv: aktiv !== undefined ? (aktiv ? 1 : 0) : 1,
      nur_service: nur_service !== undefined ? (nur_service ? 1 : 0) : 0,
      mittagspause_start: mittagspause_start || '12:00',
      wochenarbeitszeit_stunden: wochenarbeitszeit_stunden !== undefined ? parseFloat(wochenarbeitszeit_stunden) : 40,
      arbeitstage_pro_woche: arbeitstage_pro_woche !== undefined ? parseInt(arbeitstage_pro_woche, 10) : 5,
      pausenzeit_minuten: pausenzeit_minuten !== undefined ? parseInt(pausenzeit_minuten, 10) : 30,
      samstag_aktiv: samstag_aktiv !== undefined ? (samstag_aktiv ? 1 : 0) : 0,
      samstag_start: samstag_start || '09:00',
      samstag_ende: samstag_ende || '12:00',
      samstag_pausenzeit_minuten: samstag_pausenzeit_minuten !== undefined ? parseInt(samstag_pausenzeit_minuten, 10) : 0
    };

    try {
      const result = await MitarbeiterModel.create(data);
      res.json({ id: result.id, message: 'Mitarbeiter erstellt', ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async update(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Ungültige ID' });
    }

    try {
      // Prüfe zuerst, ob der Mitarbeiter existiert
      const mitarbeiter = await MitarbeiterModel.getById(id);
      if (!mitarbeiter) {
        return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
      }

      const { name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service, mittagspause_start,
              wochenarbeitszeit_stunden, arbeitstage_pro_woche, pausenzeit_minuten,
              samstag_aktiv, samstag_start, samstag_ende, samstag_pausenzeit_minuten } = req.body;
      const data = {};

      if (name !== undefined) {
        data.name = name.trim();
      }
      if (arbeitsstunden_pro_tag !== undefined) {
        data.arbeitsstunden_pro_tag = parseInt(arbeitsstunden_pro_tag, 10);
      }
      if (nebenzeit_prozent !== undefined) {
        data.nebenzeit_prozent = parseFloat(nebenzeit_prozent);
      }
      if (aktiv !== undefined) {
        data.aktiv = aktiv ? 1 : 0;
      }
      if (nur_service !== undefined) {
        data.nur_service = nur_service ? 1 : 0;
      }
      if (mittagspause_start !== undefined) {
        data.mittagspause_start = mittagspause_start;
      }
      if (wochenarbeitszeit_stunden !== undefined) {
        if (wochenarbeitszeit_stunden < 1 || wochenarbeitszeit_stunden > 168) {
          return res.status(400).json({ error: 'Wochenarbeitszeit muss zwischen 1 und 168 Stunden liegen' });
        }
        data.wochenarbeitszeit_stunden = parseFloat(wochenarbeitszeit_stunden);
      }
      if (arbeitstage_pro_woche !== undefined) {
        if (arbeitstage_pro_woche < 1 || arbeitstage_pro_woche > 6) {
          return res.status(400).json({ error: 'Arbeitstage pro Woche müssen zwischen 1 und 6 liegen' });
        }
        data.arbeitstage_pro_woche = parseInt(arbeitstage_pro_woche, 10);
      }
      if (pausenzeit_minuten !== undefined) {
        if (pausenzeit_minuten < 0 || pausenzeit_minuten > 120) {
          return res.status(400).json({ error: 'Pausenzeit muss zwischen 0 und 120 Minuten liegen' });
        }
        data.pausenzeit_minuten = parseInt(pausenzeit_minuten, 10);
      }
      if (samstag_aktiv !== undefined) {
        data.samstag_aktiv = samstag_aktiv ? 1 : 0;
      }
      if (samstag_start !== undefined) {
        data.samstag_start = samstag_start;
      }
      if (samstag_ende !== undefined) {
        data.samstag_ende = samstag_ende;
      }
      if (samstag_pausenzeit_minuten !== undefined) {
        if (samstag_pausenzeit_minuten < 0 || samstag_pausenzeit_minuten > 120) {
          return res.status(400).json({ error: 'Samstag-Pausenzeit muss zwischen 0 und 120 Minuten liegen' });
        }
        data.samstag_pausenzeit_minuten = parseInt(samstag_pausenzeit_minuten, 10);
      }

      const result = await MitarbeiterModel.update(id, data);
      const changes = (result && result.changes) || 0;
      if (changes === 0) {
        return res.status(200).json({ 
          changes: 0, 
          message: 'Keine Änderungen vorgenommen (Daten identisch)' 
        });
      }
      
      res.json({ changes, message: 'Mitarbeiter aktualisiert' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async delete(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Ungültige ID' });
    }

    try {
      const result = await MitarbeiterModel.delete(id);
      const changes = (result && result.changes) || 0;
      if (changes === 0) {
        return res.status(404).json({ error: 'Mitarbeiter nicht gefunden', changes: 0 });
      }
      res.json({ changes: changes, message: 'Mitarbeiter gelöscht' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = MitarbeiterController;

