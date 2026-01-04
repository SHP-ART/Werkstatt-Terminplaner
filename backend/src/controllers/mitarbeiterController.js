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
    const { name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service, mittagspause_start } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    const data = {
      name: name.trim(),
      arbeitsstunden_pro_tag: arbeitsstunden_pro_tag !== undefined ? parseInt(arbeitsstunden_pro_tag, 10) : 8,
      nebenzeit_prozent: nebenzeit_prozent !== undefined ? parseFloat(nebenzeit_prozent) : 0,
      aktiv: aktiv !== undefined ? (aktiv ? 1 : 0) : 1,
      nur_service: nur_service !== undefined ? (nur_service ? 1 : 0) : 0,
      mittagspause_start: mittagspause_start || '12:00'
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

      const { name, arbeitsstunden_pro_tag, nebenzeit_prozent, aktiv, nur_service, mittagspause_start } = req.body;
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

