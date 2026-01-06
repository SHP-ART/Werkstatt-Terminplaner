const AbwesenheitenModel = require('../models/abwesenheitenModel');

class AbwesenheitenController {
  // Legacy-Methoden für alte Abwesenheiten-Tabelle
  static async getByDatum(req, res) {
    try {
      const { datum } = req.params;
      const row = await AbwesenheitenModel.getByDatum(datum);
      res.json(row || { datum, urlaub: 0, krank: 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async upsert(req, res) {
    try {
      const { datum } = req.params;
      const urlaub = parseInt(req.body.urlaub, 10) || 0;
      const krank = parseInt(req.body.krank, 10) || 0;

      await AbwesenheitenModel.upsert(datum, urlaub, krank);
      res.json({ message: 'Abwesenheit gespeichert', datum, urlaub, krank });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // Neue Methoden für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
  static async getAll(req, res) {
    try {
      const rows = await AbwesenheitenModel.getAll();
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getByDateRange(req, res) {
    try {
      const { von_datum, bis_datum } = req.query;

      if (!von_datum || !bis_datum) {
        return res.status(400).json({ error: 'von_datum und bis_datum sind erforderlich' });
      }

      const rows = await AbwesenheitenModel.getByDateRange(von_datum, bis_datum);
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, typ, von_datum, bis_datum } = req.body;

      // Validierung
      if (!typ || !von_datum || !bis_datum) {
        return res.status(400).json({ error: 'typ, von_datum und bis_datum sind erforderlich' });
      }

      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'Entweder mitarbeiter_id oder lehrling_id muss angegeben werden' });
      }

      if (typ !== 'urlaub' && typ !== 'krank') {
        return res.status(400).json({ error: 'typ muss "urlaub" oder "krank" sein' });
      }

      const result = await AbwesenheitenModel.create(req.body);
      res.json({
        message: 'Abwesenheit erstellt',
        id: result.lastID
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      await AbwesenheitenModel.delete(id);
      res.json({ message: 'Abwesenheit gelöscht' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const row = await AbwesenheitenModel.getById(id);

      if (!row) {
        res.status(404).json({ error: 'Abwesenheit nicht gefunden' });
      } else {
        res.json(row);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = AbwesenheitenController;
