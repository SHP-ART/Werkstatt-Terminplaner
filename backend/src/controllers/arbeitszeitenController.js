const ArbeitszeitenModel = require('../models/arbeitszeitenModel');

class ArbeitszeitenController {
  static async getAll(req, res) {
    try {
      const rows = await ArbeitszeitenModel.getAll();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async update(req, res) {
    try {
      const { standard_minuten, bezeichnung, aliase } = req.body;
      const minuten = parseInt(standard_minuten, 10);
      const data = {
        standard_minuten: Number.isFinite(minuten) ? minuten : standard_minuten,
        bezeichnung: bezeichnung,
        aliase: aliase
      };
      const result = await ArbeitszeitenModel.update(req.params.id, data);
      res.json({ changes: (result && result.changes) || 0, message: 'Arbeitszeit aktualisiert' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    try {
      const standard_minuten = parseInt(req.body.standard_minuten, 10);
      const payload = {
        bezeichnung: req.body.bezeichnung,
        standard_minuten: Number.isFinite(standard_minuten) ? standard_minuten : req.body.standard_minuten,
        aliase: req.body.aliase || ''
      };

      const result = await ArbeitszeitenModel.create(payload);
      res.json({ id: result.lastID, message: 'Arbeitszeit erstellt' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async delete(req, res) {
    try {
      const id = req.params.id;
      
      if (!id) {
        return res.status(400).json({ error: 'ID fehlt' });
      }

      const result = await ArbeitszeitenModel.delete(id);
      const changes = (result && result.changes) || 0;
      
      if (changes === 0) {
        return res.status(404).json({ error: 'Arbeitszeit nicht gefunden', changes: 0 });
      }
      
      res.json({ changes: changes, message: 'Arbeitszeit gelöscht' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = ArbeitszeitenController;
