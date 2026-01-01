const LehrlingeModel = require('../models/lehrlingeModel');
const TermineController = require('./termineController');

class LehrlingeController {
  static getAll(req, res) {
    LehrlingeModel.getAll((err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    });
  }

  static getById(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Ungültige ID' });
    }

    LehrlingeModel.getById(id, (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Lehrling nicht gefunden' });
      } else {
        res.json(row);
      }
    });
  }

  static getAktive(req, res) {
    LehrlingeModel.getAktive((err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    });
  }

  static create(req, res) {
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

    LehrlingeModel.create(data, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        // Cache invalidieren, da neue Lehrlinge die Auslastung beeinflussen
        TermineController.invalidateAuslastungCache(null);
        res.json({ id: result.id, message: 'Lehrling erstellt', ...result });
      }
    });
  }

  static update(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Ungültige ID' });
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

    LehrlingeModel.update(id, data, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        // Cache invalidieren, da Lehrlingsänderungen die Auslastung beeinflussen
        TermineController.invalidateAuslastungCache(null);
        res.json({ changes: (result && result.changes) || 0, message: 'Lehrling aktualisiert' });
      }
    });
  }

  static delete(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Ungültige ID' });
    }

    LehrlingeModel.delete(id, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        const changes = (result && result.changes) || 0;
        if (changes === 0) {
          return res.status(404).json({ error: 'Lehrling nicht gefunden', changes: 0 });
        }
        // Cache invalidieren, da gelöschte Lehrlinge die Auslastung beeinflussen
        TermineController.invalidateAuslastungCache(null);
        res.json({ changes: changes, message: 'Lehrling gelöscht' });
      }
    });
  }
}

module.exports = LehrlingeController;

