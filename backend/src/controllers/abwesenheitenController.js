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

  static async getByMitarbeiterId(req, res) {
    try {
      const { id } = req.params;
      const rows = await AbwesenheitenModel.getByMitarbeiterId(id);
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getByLehrlingId(req, res) {
    try {
      const { id } = req.params;
      const rows = await AbwesenheitenModel.getByLehrlingId(id);
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getByDateRange(req, res) {
    try {
      const { datum_von, datum_bis } = req.query;

      if (!datum_von || !datum_bis) {
        return res.status(400).json({ error: 'datum_von und datum_bis sind erforderlich' });
      }

      const rows = await AbwesenheitenModel.getByDateRange(datum_von, datum_bis);
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getForDate(req, res) {
    try {
      const { datum } = req.params;
      const rows = await AbwesenheitenModel.getForDate(datum);
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, typ, datum_von, datum_bis, beschreibung } = req.body;

      // Validierung
      if (!typ || !datum_von || !datum_bis) {
        return res.status(400).json({ error: 'typ, datum_von und datum_bis sind erforderlich' });
      }

      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'Entweder mitarbeiter_id oder lehrling_id muss angegeben werden' });
      }

      const validTypes = ['urlaub', 'krank', 'berufsschule', 'lehrgang'];
      if (!validTypes.includes(typ)) {
        return res.status(400).json({ error: `typ muss einer von ${validTypes.join(', ')} sein` });
      }

      const result = await AbwesenheitenModel.create(req.body);
      res.json({
        message: 'Abwesenheit erstellt',
        id: result.id
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const { typ } = req.body;

      // Typ-Validierung wenn angegeben
      if (typ) {
        const validTypes = ['urlaub', 'krank', 'berufsschule', 'lehrgang'];
        if (!validTypes.includes(typ)) {
          return res.status(400).json({ error: `typ muss einer von ${validTypes.join(', ')} sein` });
        }
      }

      const result = await AbwesenheitenModel.update(id, req.body);
      res.json({
        message: 'Abwesenheit aktualisiert',
        changes: result.changes
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await AbwesenheitenModel.delete(id);
      res.json({ 
        message: 'Abwesenheit gelöscht',
        changes: result.changes 
      });
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
