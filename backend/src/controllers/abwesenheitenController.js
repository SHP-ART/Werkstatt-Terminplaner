const AbwesenheitenModel = require('../models/abwesenheitenModel');

class AbwesenheitenController {
  // Legacy-Methoden für alte Abwesenheiten-Tabelle
  static getByDatum(req, res) {
    const { datum } = req.params;

    AbwesenheitenModel.getByDatum(datum, (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(row || { datum, urlaub: 0, krank: 0 });
      }
    });
  }

  static upsert(req, res) {
    const { datum } = req.params;
    const urlaub = parseInt(req.body.urlaub, 10) || 0;
    const krank = parseInt(req.body.krank, 10) || 0;

    AbwesenheitenModel.upsert(datum, urlaub, krank, (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: 'Abwesenheit gespeichert', datum, urlaub, krank });
      }
    });
  }

  // Neue Methoden für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
  static getAll(req, res) {
    AbwesenheitenModel.getAll((err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    });
  }

  static getByDateRange(req, res) {
    const { von_datum, bis_datum } = req.query;

    if (!von_datum || !bis_datum) {
      return res.status(400).json({ error: 'von_datum und bis_datum sind erforderlich' });
    }

    AbwesenheitenModel.getByDateRange(von_datum, bis_datum, (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    });
  }

  static create(req, res) {
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

    AbwesenheitenModel.create(req.body, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          message: 'Abwesenheit erstellt',
          id: this.lastID
        });
      }
    });
  }

  static delete(req, res) {
    const { id } = req.params;

    AbwesenheitenModel.delete(id, (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: 'Abwesenheit gelöscht' });
      }
    });
  }

  static getById(req, res) {
    const { id } = req.params;

    AbwesenheitenModel.getById(id, (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Abwesenheit nicht gefunden' });
      } else {
        res.json(row);
      }
    });
  }
}

module.exports = AbwesenheitenController;
