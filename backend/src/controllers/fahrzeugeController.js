const Fahrzeug = require('../models/fahrzeug');
const openaiService = require('../services/openaiService');

/**
 * Fahrzeuge Controller
 * Verwaltet alle Fahrzeug-bezogenen API-Endpunkte
 */

// Alle Fahrzeuge abrufen
exports.getAll = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const fahrzeuge = await Fahrzeug.getAll(limit);
    res.json(fahrzeuge);
  } catch (error) {
    console.error('Fehler beim Laden der Fahrzeuge:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Fahrzeuge' });
  }
};

// Einzelnes Fahrzeug nach ID
exports.getById = async (req, res) => {
  try {
    const fahrzeug = await Fahrzeug.findById(req.params.id);
    if (!fahrzeug) {
      return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    }
    res.json(fahrzeug);
  } catch (error) {
    console.error('Fehler beim Laden des Fahrzeugs:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Fahrzeugs' });
  }
};

// Fahrzeug nach VIN suchen
exports.getByVin = async (req, res) => {
  try {
    const vin = req.params.vin || req.query.vin;
    if (!vin) {
      return res.status(400).json({ error: 'VIN erforderlich' });
    }
    
    const fahrzeug = await Fahrzeug.findByVin(vin.toUpperCase());
    if (!fahrzeug) {
      return res.status(404).json({ error: 'Fahrzeug nicht gefunden', vin: vin });
    }
    res.json(fahrzeug);
  } catch (error) {
    console.error('Fehler bei VIN-Suche:', error);
    res.status(500).json({ error: 'Fehler bei der VIN-Suche' });
  }
};

// Fahrzeug nach Kennzeichen suchen
exports.getByKennzeichen = async (req, res) => {
  try {
    const kennzeichen = req.params.kennzeichen || req.query.kennzeichen;
    if (!kennzeichen) {
      return res.status(400).json({ error: 'Kennzeichen erforderlich' });
    }
    
    const fahrzeug = await Fahrzeug.findByKennzeichen(kennzeichen.toUpperCase());
    if (!fahrzeug) {
      return res.status(404).json({ error: 'Fahrzeug nicht gefunden', kennzeichen: kennzeichen });
    }
    res.json(fahrzeug);
  } catch (error) {
    console.error('Fehler bei Kennzeichen-Suche:', error);
    res.status(500).json({ error: 'Fehler bei der Kennzeichen-Suche' });
  }
};

// Fahrzeuge eines Kunden abrufen
exports.getByKunde = async (req, res) => {
  try {
    const kundeId = req.params.kundeId;
    const fahrzeuge = await Fahrzeug.findByKundeId(kundeId);
    res.json(fahrzeuge);
  } catch (error) {
    console.error('Fehler beim Laden der Kundenfahrzeuge:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Fahrzeuge' });
  }
};

// Fahrzeuge suchen
exports.search = async (req, res) => {
  try {
    const suchbegriff = req.query.q || req.query.search || '';
    if (!suchbegriff || suchbegriff.length < 2) {
      return res.status(400).json({ error: 'Suchbegriff muss mindestens 2 Zeichen haben' });
    }
    
    const fahrzeuge = await Fahrzeug.search(suchbegriff);
    res.json(fahrzeuge);
  } catch (error) {
    console.error('Fehler bei Fahrzeugsuche:', error);
    res.status(500).json({ error: 'Fehler bei der Suche' });
  }
};

// Neues Fahrzeug erstellen
exports.create = async (req, res) => {
  try {
    const daten = req.body;
    
    if (!daten.kennzeichen && !daten.vin) {
      return res.status(400).json({ error: 'Kennzeichen oder VIN erforderlich' });
    }
    
    const fahrzeug = await Fahrzeug.create(daten);
    res.status(201).json(fahrzeug);
  } catch (error) {
    console.error('Fehler beim Erstellen des Fahrzeugs:', error);
    if (error.message && error.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Fahrzeug mit dieser VIN existiert bereits' });
    } else {
      res.status(500).json({ error: 'Fehler beim Erstellen des Fahrzeugs' });
    }
  }
};

// Fahrzeug aktualisieren
exports.update = async (req, res) => {
  try {
    const id = req.params.id;
    const daten = req.body;
    
    const result = await Fahrzeug.update(id, daten);
    res.json(result);
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Fahrzeugs:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
};

// Fahrzeug löschen
exports.delete = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await Fahrzeug.delete(id);
    
    if (!result.deleted) {
      return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    }
    
    res.json({ success: true, message: 'Fahrzeug gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen des Fahrzeugs:', error);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
};

// VIN dekodieren und optional speichern
exports.decodeAndSave = async (req, res) => {
  try {
    const { vin, kennzeichen, kunde_id, speichern = false } = req.body;
    
    if (!vin) {
      return res.status(400).json({ error: 'VIN erforderlich' });
    }
    
    // VIN dekodieren
    const vinData = openaiService.decodeVIN(vin);
    
    if (!vinData.success) {
      return res.status(400).json(vinData);
    }
    
    // Optional: In Datenbank speichern
    if (speichern && kennzeichen) {
      try {
        const fahrzeug = await Fahrzeug.saveFromVinDecode(vinData, kennzeichen, kunde_id);
        return res.json({
          ...vinData,
          gespeichert: true,
          fahrzeug_id: fahrzeug.id
        });
      } catch (saveError) {
        console.error('Fehler beim Speichern:', saveError);
        return res.json({
          ...vinData,
          gespeichert: false,
          speicherFehler: saveError.message
        });
      }
    }
    
    res.json(vinData);
  } catch (error) {
    console.error('Fehler bei VIN-Dekodierung:', error);
    res.status(500).json({ error: 'Fehler bei der VIN-Dekodierung' });
  }
};

// VIN dekodieren und Fahrzeug automatisch anlegen/aktualisieren
exports.vinLookup = async (req, res) => {
  try {
    const { vin, kennzeichen, kunde_id } = req.body;
    
    if (!vin) {
      return res.status(400).json({ error: 'VIN erforderlich' });
    }
    
    // 1. Prüfe ob Fahrzeug schon in DB existiert
    let fahrzeug = await Fahrzeug.findByVin(vin.toUpperCase());
    
    if (fahrzeug) {
      // Fahrzeug existiert - ggf. Kennzeichen/Kunde aktualisieren
      if (kennzeichen || kunde_id) {
        await Fahrzeug.update(fahrzeug.id, {
          kennzeichen: kennzeichen || fahrzeug.kennzeichen,
          kunde_id: kunde_id || fahrzeug.kunde_id
        });
        fahrzeug = await Fahrzeug.findById(fahrzeug.id);
      }
      
      return res.json({
        quelle: 'datenbank',
        fahrzeug: fahrzeug,
        hinweis: 'Fahrzeug aus lokaler Datenbank geladen'
      });
    }
    
    // 2. VIN dekodieren
    const vinData = openaiService.decodeVIN(vin);
    
    if (!vinData.success) {
      return res.status(400).json({
        error: vinData.error,
        vin: vin
      });
    }
    
    // 3. Wenn Kennzeichen angegeben: speichern
    if (kennzeichen) {
      fahrzeug = await Fahrzeug.saveFromVinDecode(vinData, kennzeichen, kunde_id);
      
      return res.json({
        quelle: 'vin-decoder',
        fahrzeug: fahrzeug,
        vinData: vinData,
        hinweis: 'Fahrzeug aus VIN dekodiert und gespeichert'
      });
    }
    
    // 4. Nur dekodieren, nicht speichern
    res.json({
      quelle: 'vin-decoder',
      vinData: vinData,
      hinweis: 'Zum Speichern Kennzeichen angeben'
    });
    
  } catch (error) {
    console.error('Fehler bei VIN-Lookup:', error);
    res.status(500).json({ error: 'Fehler beim Fahrzeug-Lookup' });
  }
};
