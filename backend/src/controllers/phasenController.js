const PhasenModel = require('../models/phasenModel');

class PhasenController {
  // Alle Phasen abrufen
  static async getAll(req, res) {
    try {
      const phasen = await PhasenModel.getAll();
      res.json(phasen);
    } catch (error) {
      console.error('Fehler beim Abrufen der Phasen:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen der Phasen' });
    }
  }

  // Alle Phasen eines Termins abrufen
  static async getByTerminId(req, res) {
    try {
      const { terminId } = req.params;
      const phasen = await PhasenModel.getByTerminId(terminId);
      res.json(phasen);
    } catch (error) {
      console.error('Fehler beim Abrufen der Phasen:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen der Phasen' });
    }
  }

  // Alle Phasen für ein Datum abrufen
  static async getByDatum(req, res) {
    try {
      const { datum } = req.params;
      const phasen = await PhasenModel.getByDatum(datum);
      res.json(phasen);
    } catch (error) {
      console.error('Fehler beim Abrufen der Phasen für Datum:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen der Phasen' });
    }
  }

  // Einzelne Phase abrufen
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const phase = await PhasenModel.getById(id);
      if (!phase) {
        return res.status(404).json({ error: 'Phase nicht gefunden' });
      }
      res.json(phase);
    } catch (error) {
      console.error('Fehler beim Abrufen der Phase:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen der Phase' });
    }
  }

  // Neue Phase erstellen
  static async create(req, res) {
    try {
      const phase = await PhasenModel.create(req.body);
      res.status(201).json(phase);
    } catch (error) {
      console.error('Fehler beim Erstellen der Phase:', error);
      res.status(500).json({ error: 'Fehler beim Erstellen der Phase' });
    }
  }

  // Phase aktualisieren
  static async update(req, res) {
    try {
      const { id } = req.params;
      const result = await PhasenModel.update(id, req.body);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Phase nicht gefunden' });
      }
      const updated = await PhasenModel.getById(id);
      res.json(updated);
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Phase:', error);
      res.status(500).json({ error: 'Fehler beim Aktualisieren der Phase' });
    }
  }

  // Phase löschen
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await PhasenModel.delete(id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Phase nicht gefunden' });
      }
      res.json({ message: 'Phase gelöscht' });
    } catch (error) {
      console.error('Fehler beim Löschen der Phase:', error);
      res.status(500).json({ error: 'Fehler beim Löschen der Phase' });
    }
  }

  // Alle Phasen eines Termins synchronisieren (löschen + neu erstellen)
  static async syncPhasen(req, res) {
    try {
      const { terminId } = req.params;
      const { phasen } = req.body;
      
      if (!Array.isArray(phasen)) {
        return res.status(400).json({ error: 'Phasen müssen als Array übergeben werden' });
      }
      
      const results = await PhasenModel.syncPhasen(terminId, phasen);
      res.json(results);
    } catch (error) {
      console.error('Fehler beim Synchronisieren der Phasen:', error);
      res.status(500).json({ error: 'Fehler beim Synchronisieren der Phasen' });
    }
  }
}

module.exports = PhasenController;
