const KundenModel = require('../models/kundenModel');

class KundenController {
  static async getAll(req, res) {
    try {
      const rows = await KundenModel.getAll();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    try {
      const result = await KundenModel.create(req.body);
      res.status(201).json({ id: result.lastID, message: 'Kunde erfolgreich angelegt' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async import(req, res) {
    const kunden = req.body;

    if (!Array.isArray(kunden)) {
      return res.status(400).json({ error: 'Erwarte ein Array von Kunden' });
    }

    try {
      const result = await KundenModel.importMultiple(kunden);
      let message = `${result.imported} Kunden importiert`;
      if (result.fahrzeugeHinzugefuegt > 0) {
        message += `, ${result.fahrzeugeHinzugefuegt} zusätzliche Fahrzeuge hinzugefügt`;
      }
      if (result.skipped > 0) {
        message += `, ${result.skipped} übersprungen`;
      }
      res.json({ 
        message, 
        imported: result.imported, 
        fahrzeugeHinzugefuegt: result.fahrzeugeHinzugefuegt || 0,
        skipped: result.skipped,
        errors: result.errors 
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getById(req, res) {
    // Verhindere, dass "search" als ID interpretiert wird
    if (req.params.id === 'search') {
      return res.status(404).json({ error: 'Route nicht gefunden' });
    }
    
    try {
      const row = await KundenModel.getById(req.params.id);
      if (!row) {
        return res.status(404).json({ error: 'Kunde nicht gefunden' });
      }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async update(req, res) {
    try {
      // Prüfe zuerst, ob der Kunde existiert
      const kunde = await KundenModel.getById(req.params.id);
      if (!kunde) {
        return res.status(404).json({ error: 'Kunde nicht gefunden' });
      }

      // Führe Update durch
      const result = await KundenModel.update(req.params.id, req.body);
      const changes = (result && result.changes) || 0;
      if (changes === 0) {
        return res.status(200).json({ 
          changes: 0, 
          message: 'Keine Änderungen vorgenommen (Daten identisch)' 
        });
      }
      
      res.json({ changes, message: 'Kunde aktualisiert' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async delete(req, res) {
    try {
      const result = await KundenModel.delete(req.params.id);
      res.json({ changes: (result && result.changes) || 0, message: 'Kunde gelöscht' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async search(req, res) {
    const searchTerm = req.query.search;

    console.log('Search endpoint called with searchTerm:', searchTerm);

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({ error: 'Suchbegriff darf nicht leer sein' });
    }

    try {
      const results = await KundenModel.searchWithTermine(searchTerm);
      console.log('Search results:', results.length, 'customers found');
      res.json(results);
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Anzahl aller Fahrzeuge in der Datenbank
  static async countFahrzeuge(req, res) {
    try {
      const anzahl = await KundenModel.countAlleFahrzeuge();
      res.json({ anzahl });
    } catch (err) {
      console.error('Fehler beim Zählen der Fahrzeuge:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Alle Fahrzeuge (Kennzeichen) eines Kunden abrufen
  static async getFahrzeuge(req, res) {
    const kundeId = req.params.id;
    
    try {
      const fahrzeuge = await KundenModel.getFahrzeuge(kundeId);
      res.json(fahrzeuge);
    } catch (err) {
      console.error('Fehler beim Abrufen der Fahrzeuge:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Fahrzeug zu einem Kunden hinzufügen
  static async addFahrzeug(req, res) {
    const kundeId = req.params.id;
    const fahrzeug = req.body;
    
    try {
      const result = await KundenModel.addFahrzeug(kundeId, fahrzeug);
      res.json(result);
    } catch (err) {
      console.error('Fehler beim Hinzufügen des Fahrzeugs:', err);
      res.status(400).json({ error: err.message });
    }
  }

  // Fahrzeug eines Kunden löschen
  static async deleteFahrzeug(req, res) {
    const kundeId = req.params.id;
    const kennzeichen = decodeURIComponent(req.params.kennzeichen);
    
    try {
      const result = await KundenModel.deleteFahrzeug(kundeId, kennzeichen);
      res.json(result);
    } catch (err) {
      console.error('Fehler beim Löschen des Fahrzeugs:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Fahrzeugdaten aktualisieren
  static async updateFahrzeug(req, res) {
    const kundeId = req.params.id;
    const altesKennzeichen = decodeURIComponent(req.params.kennzeichen);
    const neuesDaten = req.body;
    
    try {
      const result = await KundenModel.updateFahrzeug(kundeId, altesKennzeichen, neuesDaten);
      res.json(result);
    } catch (err) {
      console.error('Fehler beim Aktualisieren des Fahrzeugs:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Kompakte Dropdown-Daten für Kundenauswahl
   * GET /kunden/dropdown
   * Gibt nur ID, Name, Kennzeichen zurück (minimal für Dropdown)
   */
  static async getDropdownData(req, res) {
    try {
      const { db } = require('../config/database');
      
      const kunden = await new Promise((resolve, reject) => {
        db.all(`
          SELECT id, name, kennzeichen
          FROM kunden
          ORDER BY name ASC
          LIMIT 200
        `, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      res.json(kunden);
    } catch (err) {
      console.error('Fehler bei getDropdownData:', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = KundenController;
