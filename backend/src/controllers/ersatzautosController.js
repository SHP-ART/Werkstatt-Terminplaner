const ErsatzautosModel = require('../models/ersatzautosModel');

const ersatzautosController = {
  // Alle Ersatzautos abrufen
  getAll: async (req, res) => {
    try {
      const autos = await ErsatzautosModel.getAll();
      res.json(autos);
    } catch (err) {
      console.error('Fehler beim Abrufen der Ersatzautos:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Nur aktive Ersatzautos
  getActive: async (req, res) => {
    try {
      const autos = await ErsatzautosModel.getActive();
      res.json(autos);
    } catch (err) {
      console.error('Fehler beim Abrufen der aktiven Ersatzautos:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Einzelnes Ersatzauto abrufen
  getById: async (req, res) => {
    try {
      const auto = await ErsatzautosModel.getById(req.params.id);
      if (!auto) {
        return res.status(404).json({ error: 'Ersatzauto nicht gefunden' });
      }
      res.json(auto);
    } catch (err) {
      console.error('Fehler beim Abrufen des Ersatzautos:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Neues Ersatzauto anlegen
  create: async (req, res) => {
    const { kennzeichen, name, typ, aktiv } = req.body;
    
    if (!kennzeichen || !name) {
      return res.status(400).json({ error: 'Kennzeichen und Name sind erforderlich' });
    }
    
    try {
      const neuesAuto = await ErsatzautosModel.create({ kennzeichen, name, typ, aktiv });
      res.status(201).json(neuesAuto);
    } catch (err) {
      console.error('Fehler beim Erstellen des Ersatzautos:', err);
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ein Fahrzeug mit diesem Kennzeichen existiert bereits' });
      }
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Ersatzauto aktualisieren
  update: async (req, res) => {
    const { kennzeichen, name, typ, aktiv } = req.body;
    
    if (!kennzeichen || !name) {
      return res.status(400).json({ error: 'Kennzeichen und Name sind erforderlich' });
    }
    
    try {
      const updated = await ErsatzautosModel.update(req.params.id, { kennzeichen, name, typ, aktiv });
      if (!updated) {
        return res.status(404).json({ error: 'Ersatzauto nicht gefunden' });
      }
      res.json(updated);
    } catch (err) {
      console.error('Fehler beim Aktualisieren des Ersatzautos:', err);
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ein Fahrzeug mit diesem Kennzeichen existiert bereits' });
      }
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Ersatzauto löschen
  delete: async (req, res) => {
    try {
      await ErsatzautosModel.delete(req.params.id);
      res.json({ message: 'Ersatzauto gelöscht' });
    } catch (err) {
      console.error('Fehler beim Löschen des Ersatzautos:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Verfügbarkeit für Datum
  getVerfuegbarkeit: async (req, res) => {
    try {
      const datum = req.params.datum;
      const verfuegbarkeit = await ErsatzautosModel.getVerfuegbarkeit(datum);
      res.json(verfuegbarkeit);
    } catch (err) {
      console.error('Fehler beim Abrufen der Verfügbarkeit:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Detaillierte Verfügbarkeit
  getVerfuegbarkeitDetails: async (req, res) => {
    try {
      const datum = req.params.datum;
      const details = await ErsatzautosModel.getVerfuegbarkeitDetails(datum);
      res.json(details);
    } catch (err) {
      console.error('Fehler beim Abrufen der Verfügbarkeitsdetails:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Aktuelle Buchungen (heute und laufende)
  getAktuelleBuchungen: async (req, res) => {
    try {
      const buchungen = await ErsatzautosModel.getAktuelleBuchungen();
      res.json(buchungen);
    } catch (err) {
      console.error('Fehler beim Abrufen der aktuellen Buchungen:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Buchungen im Zeitraum prüfen (für Sperrwarnung)
  getBuchungenImZeitraum: async (req, res) => {
    try {
      const { von, bis } = req.query;
      if (!von || !bis) {
        return res.status(400).json({ error: 'Parameter "von" und "bis" sind erforderlich' });
      }
      const buchungen = await ErsatzautosModel.getBuchungenImZeitraum(von, bis);
      res.json(buchungen);
    } catch (err) {
      console.error('Fehler beim Abrufen der Buchungen im Zeitraum:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Heute fällige Rückgaben
  getHeuteRueckgaben: async (req, res) => {
    try {
      const rueckgaben = await ErsatzautosModel.getHeuteRueckgaben();
      res.json(rueckgaben);
    } catch (err) {
      console.error('Fehler beim Abrufen der heute fälligen Rückgaben:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Manuelle Sperrung umschalten
  toggleManuellGesperrt: async (req, res) => {
    try {
      const id = req.params.id;
      const auto = await ErsatzautosModel.toggleManuellGesperrt(id);
      if (!auto) {
        return res.status(404).json({ error: 'Ersatzauto nicht gefunden' });
      }
      res.json(auto);
    } catch (err) {
      console.error('Fehler beim Umschalten der Sperrung:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Manuelle Sperrung direkt setzen
  setManuellGesperrt: async (req, res) => {
    const id = req.params.id;
    const { gesperrt } = req.body;
    
    if (typeof gesperrt !== 'boolean' && gesperrt !== 0 && gesperrt !== 1) {
      return res.status(400).json({ error: 'Feld "gesperrt" muss boolean sein' });
    }
    
    try {
      const auto = await ErsatzautosModel.setManuellGesperrt(id, gesperrt);
      if (!auto) {
        return res.status(404).json({ error: 'Ersatzauto nicht gefunden' });
      }
      res.json(auto);
    } catch (err) {
      console.error('Fehler beim Setzen der Sperrung:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Zeitbasierte Sperrung setzen (sperren bis zu einem bestimmten Datum) mit Sperrgrund
  sperrenBis: async (req, res) => {
    const id = req.params.id;
    const { bisDatum, sperrgrund } = req.body;
    
    if (!bisDatum) {
      return res.status(400).json({ error: 'Feld "bisDatum" ist erforderlich' });
    }
    
    try {
      const auto = await ErsatzautosModel.sperrenBis(id, bisDatum, sperrgrund || null);
      if (!auto) {
        return res.status(404).json({ error: 'Ersatzauto nicht gefunden' });
      }
      res.json(auto);
    } catch (err) {
      console.error('Fehler beim Setzen der zeitbasierten Sperrung:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Sperrung aufheben
  entsperren: async (req, res) => {
    try {
      const id = req.params.id;
      const auto = await ErsatzautosModel.entsperren(id);
      if (!auto) {
        return res.status(404).json({ error: 'Ersatzauto nicht gefunden' });
      }
      res.json(auto);
    } catch (err) {
      console.error('Fehler beim Aufheben der Sperrung:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // Buchung als früh zurückgegeben markieren
  markiereAlsZurueckgegeben: async (req, res) => {
    try {
      const terminId = req.params.terminId;
      const termin = await ErsatzautosModel.markiereAlsZurueckgegeben(terminId);
      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }
      res.json({ success: true, termin });
    } catch (err) {
      console.error('Fehler beim Markieren als zurückgegeben:', err);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  }
};

module.exports = ersatzautosController;
