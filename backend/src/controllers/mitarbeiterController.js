const MitarbeiterModel = require('../models/mitarbeiterModel');

class MitarbeiterController {
  static getAll(req, res) {
    MitarbeiterModel.getAll((err, rows) => {
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

    MitarbeiterModel.getById(id, (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!row) {
        res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
      } else {
        res.json(row);
      }
    });
  }

  static getAktive(req, res) {
    MitarbeiterModel.getAktive((err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    });
  }

  static create(req, res) {
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

    MitarbeiterModel.create(data, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ id: result.id, message: 'Mitarbeiter erstellt', ...result });
      }
    });
  }

  static update(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Ungültige ID' });
    }

    // Prüfe zuerst, ob der Mitarbeiter existiert
    MitarbeiterModel.getById(id, (err, mitarbeiter) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
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

      MitarbeiterModel.update(id, data, (updateErr, result) => {
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }
        
        const changes = (result && result.changes) || 0;
        if (changes === 0) {
          return res.status(200).json({ 
            changes: 0, 
            message: 'Keine Änderungen vorgenommen (Daten identisch)' 
          });
        }
        
        res.json({ changes, message: 'Mitarbeiter aktualisiert' });
      });
    });
  }

  static delete(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Ungültige ID' });
    }

    MitarbeiterModel.delete(id, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        const changes = (result && result.changes) || 0;
        if (changes === 0) {
          return res.status(404).json({ error: 'Mitarbeiter nicht gefunden', changes: 0 });
        }
        res.json({ changes: changes, message: 'Mitarbeiter gelöscht' });
      }
    });
  }
}

module.exports = MitarbeiterController;

