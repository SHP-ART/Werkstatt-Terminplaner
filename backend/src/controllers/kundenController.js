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

    KundenModel.importMultiple(kunden, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
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
      }
    });
  }

  static getById(req, res) {
    // Verhindere, dass "search" als ID interpretiert wird
    if (req.params.id === 'search') {
      return res.status(404).json({ error: 'Route nicht gefunden' });
    }
    
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
    // Prüfe zuerst, ob der Kunde existiert
    KundenModel.getById(req.params.id, (err, kunde) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!kunde) {
        return res.status(404).json({ error: 'Kunde nicht gefunden' });
      }

      // Führe Update durch
      KundenModel.update(req.params.id, req.body, (updateErr, result) => {
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
        
        res.json({ changes, message: 'Kunde aktualisiert' });
      });
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

  static search(req, res) {
    const searchTerm = req.query.search;

    console.log('Search endpoint called with searchTerm:', searchTerm);

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({ error: 'Suchbegriff darf nicht leer sein' });
    }

    KundenModel.searchWithTermine(searchTerm, (err, results) => {
      if (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
      } else {
        console.log('Search results:', results.length, 'customers found');
        res.json(results);
      }
    });
  }

  // Anzahl aller Fahrzeuge in der Datenbank
  static countFahrzeuge(req, res) {
    KundenModel.countAlleFahrzeuge((err, anzahl) => {
      if (err) {
        console.error('Fehler beim Zählen der Fahrzeuge:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json({ anzahl });
      }
    });
  }

  // Alle Fahrzeuge (Kennzeichen) eines Kunden abrufen
  static getFahrzeuge(req, res) {
    const kundeId = req.params.id;
    
    KundenModel.getFahrzeuge(kundeId, (err, fahrzeuge) => {
      if (err) {
        console.error('Fehler beim Abrufen der Fahrzeuge:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json(fahrzeuge);
      }
    });
  }

  // Fahrzeug zu einem Kunden hinzufügen
  static addFahrzeug(req, res) {
    const kundeId = req.params.id;
    const fahrzeug = req.body;
    
    KundenModel.addFahrzeug(kundeId, fahrzeug, (err, result) => {
      if (err) {
        console.error('Fehler beim Hinzufügen des Fahrzeugs:', err);
        res.status(400).json({ error: err.message });
      } else {
        res.json(result);
      }
    });
  }

  // Fahrzeug eines Kunden löschen
  static deleteFahrzeug(req, res) {
    const kundeId = req.params.id;
    const kennzeichen = decodeURIComponent(req.params.kennzeichen);
    
    KundenModel.deleteFahrzeug(kundeId, kennzeichen, (err, result) => {
      if (err) {
        console.error('Fehler beim Löschen des Fahrzeugs:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json(result);
      }
    });
  }

  // Fahrzeugdaten aktualisieren
  static updateFahrzeug(req, res) {
    const kundeId = req.params.id;
    const altesKennzeichen = decodeURIComponent(req.params.kennzeichen);
    const neuesDaten = req.body;
    
    KundenModel.updateFahrzeug(kundeId, altesKennzeichen, neuesDaten, (err, result) => {
      if (err) {
        console.error('Fehler beim Aktualisieren des Fahrzeugs:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json(result);
      }
    });
  }
}

module.exports = KundenController;
