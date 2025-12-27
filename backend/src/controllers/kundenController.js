const KundenModel = require('../models/kundenModel');

class KundenController {
  static getAll(req, res) {
    KundenModel.getAll((err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    });
  }

  static create(req, res) {
    KundenModel.create(req.body, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ id: this.lastID, message: 'Kunde erfolgreich angelegt' });
      }
    });
  }

  static import(req, res) {
    const kunden = req.body;

    if (!Array.isArray(kunden)) {
      return res.status(400).json({ error: 'Erwarte ein Array von Kunden' });
    }

    KundenModel.importMultiple(kunden, (err, imported) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: `${imported} Kunden importiert` });
      }
    });
  }

  static getById(req, res) {
    KundenModel.getById(req.params.id, (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Kunde nicht gefunden' });
      } else {
        res.json(row);
      }
    });
  }

  static update(req, res) {
    KundenModel.update(req.params.id, req.body, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ changes: (result && result.changes) || 0, message: 'Kunde aktualisiert' });
      }
    });
  }

  static delete(req, res) {
    KundenModel.delete(req.params.id, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ changes: (result && result.changes) || 0, message: 'Kunde gelöscht' });
      }
    });
  }
}

module.exports = KundenController;
