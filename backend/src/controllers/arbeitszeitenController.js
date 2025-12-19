const ArbeitszeitenModel = require('../models/arbeitszeitenModel');

class ArbeitszeitenController {
  static getAll(req, res) {
    ArbeitszeitenModel.getAll((err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    });
  }

  static update(req, res) {
    const { standard_minuten, bezeichnung } = req.body;
    const minuten = parseInt(standard_minuten, 10);
    const data = {
      standard_minuten: Number.isFinite(minuten) ? minuten : standard_minuten,
      bezeichnung: bezeichnung
    };
    ArbeitszeitenModel.update(req.params.id, data, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ changes: this.changes, message: 'Arbeitszeit aktualisiert' });
      }
    });
  }

  static create(req, res) {
    const standard_minuten = parseInt(req.body.standard_minuten, 10);
    const payload = {
      bezeichnung: req.body.bezeichnung,
      standard_minuten: Number.isFinite(standard_minuten) ? standard_minuten : req.body.standard_minuten
    };

    ArbeitszeitenModel.create(payload, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ id: this.lastID, message: 'Arbeitszeit erstellt' });
      }
    });
  }

  static delete(req, res) {
    ArbeitszeitenModel.delete(req.params.id, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ changes: this.changes, message: 'Arbeitszeit gelöscht' });
      }
    });
  }
}

module.exports = ArbeitszeitenController;
