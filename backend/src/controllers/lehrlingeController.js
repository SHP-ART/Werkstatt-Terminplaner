const LehrlingeModel = require('../models/lehrlingeModel');
const TermineController = require('./termineController');

class LehrlingeController {
  static async getAll(req, res) {
    try {
      const rows = await LehrlingeModel.getAll();
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
      const row = await LehrlingeModel.getById(id);
      if (!row) {
        return res.status(404).json({ error: 'Lehrling nicht gefunden' });
      }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getAktive(req, res) {
    try {
      const rows = await LehrlingeModel.getAktive();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    const { name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv, mittagspause_start } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    const data = {
      name: name.trim(),
      nebenzeit_prozent: nebenzeit_prozent !== undefined ? parseFloat(nebenzeit_prozent) : 0,
      aufgabenbewaeltigung_prozent: aufgabenbewaeltigung_prozent !== undefined ? parseFloat(aufgabenbewaeltigung_prozent) : 100,
      aktiv: aktiv !== undefined ? (aktiv ? 1 : 0) : 1,
      mittagspause_start: mittagspause_start || '12:00'
    };

    try {
      const result = await LehrlingeModel.create(data);
      // Cache invalidieren, da neue Lehrlinge die Auslastung beeinflussen
      TermineController.invalidateAuslastungCache(null);
      res.json({ id: result.id, message: 'Lehrling erstellt', ...result });
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
      // Prüfe zuerst, ob der Lehrling existiert
      const lehrling = await LehrlingeModel.getById(id);
      if (!lehrling) {
        return res.status(404).json({ error: 'Lehrling nicht gefunden' });
      }

      const { name, nebenzeit_prozent, aufgabenbewaeltigung_prozent, aktiv, mittagspause_start } = req.body;
      const data = {};

      if (name !== undefined) {
        data.name = name.trim();
      }
      if (nebenzeit_prozent !== undefined) {
        data.nebenzeit_prozent = parseFloat(nebenzeit_prozent);
      }
      if (aufgabenbewaeltigung_prozent !== undefined) {
        data.aufgabenbewaeltigung_prozent = parseFloat(aufgabenbewaeltigung_prozent);
      }
      if (aktiv !== undefined) {
        data.aktiv = aktiv ? 1 : 0;
      }
      if (mittagspause_start !== undefined) {
        data.mittagspause_start = mittagspause_start;
      }

      const result = await LehrlingeModel.update(id, data);
      const changes = (result && result.changes) || 0;
      
      // Cache invalidieren, da Lehrlingsänderungen die Auslastung beeinflussen
      TermineController.invalidateAuslastungCache(null);
      
      if (changes === 0) {
        return res.status(200).json({ 
          changes: 0, 
          message: 'Keine Änderungen vorgenommen (Daten identisch)' 
        });
      }
      
      res.json({ changes, message: 'Lehrling aktualisiert' });
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
      const result = await LehrlingeModel.delete(id);
      const changes = (result && result.changes) || 0;
      if (changes === 0) {
        return res.status(404).json({ error: 'Lehrling nicht gefunden', changes: 0 });
      }
      // Cache invalidieren, da gelöschte Lehrlinge die Auslastung beeinflussen
      TermineController.invalidateAuslastungCache(null);
      res.json({ changes: changes, message: 'Lehrling gelöscht' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = LehrlingeController;

