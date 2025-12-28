const ErsatzautosModel = require('../models/ersatzautosModel');

const ersatzautosController = {
  // Alle Ersatzautos abrufen
  getAll: (req, res) => {
    ErsatzautosModel.getAll((err, autos) => {
      if (err) {
        console.error('Fehler beim Abrufen der Ersatzautos:', err);
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      res.json(autos);
    });
  },

  // Nur aktive Ersatzautos
  getActive: (req, res) => {
    ErsatzautosModel.getActive((err, autos) => {
      if (err) {
        console.error('Fehler beim Abrufen der aktiven Ersatzautos:', err);
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      res.json(autos);
    });
  },

  // Einzelnes Ersatzauto abrufen
  getById: (req, res) => {
    ErsatzautosModel.getById(req.params.id, (err, auto) => {
      if (err) {
        console.error('Fehler beim Abrufen des Ersatzautos:', err);
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      if (!auto) {
        return res.status(404).json({ error: 'Ersatzauto nicht gefunden' });
      }
      res.json(auto);
    });
  },

  // Neues Ersatzauto anlegen
  create: (req, res) => {
    const { kennzeichen, name, typ, aktiv } = req.body;
    
    if (!kennzeichen || !name) {
      return res.status(400).json({ error: 'Kennzeichen und Name sind erforderlich' });
    }
    
    ErsatzautosModel.create({ kennzeichen, name, typ, aktiv }, (err, neuesAuto) => {
      if (err) {
        console.error('Fehler beim Erstellen des Ersatzautos:', err);
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Ein Fahrzeug mit diesem Kennzeichen existiert bereits' });
        }
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      res.status(201).json(neuesAuto);
    });
  },

  // Ersatzauto aktualisieren
  update: (req, res) => {
    const { kennzeichen, name, typ, aktiv } = req.body;
    
    if (!kennzeichen || !name) {
      return res.status(400).json({ error: 'Kennzeichen und Name sind erforderlich' });
    }
    
    ErsatzautosModel.update(req.params.id, { kennzeichen, name, typ, aktiv }, (err, updated) => {
      if (err) {
        console.error('Fehler beim Aktualisieren des Ersatzautos:', err);
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Ein Fahrzeug mit diesem Kennzeichen existiert bereits' });
        }
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      if (!updated) {
        return res.status(404).json({ error: 'Ersatzauto nicht gefunden' });
      }
      res.json(updated);
    });
  },

  // Ersatzauto löschen
  delete: (req, res) => {
    ErsatzautosModel.delete(req.params.id, (err) => {
      if (err) {
        console.error('Fehler beim Löschen des Ersatzautos:', err);
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      res.json({ message: 'Ersatzauto gelöscht' });
    });
  },

  // Verfügbarkeit für Datum
  getVerfuegbarkeit: (req, res) => {
    const datum = req.params.datum;
    ErsatzautosModel.getVerfuegbarkeit(datum, (err, verfuegbarkeit) => {
      if (err) {
        console.error('Fehler beim Abrufen der Verfügbarkeit:', err);
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      res.json(verfuegbarkeit);
    });
  },

  // Detaillierte Verfügbarkeit
  getVerfuegbarkeitDetails: (req, res) => {
    const datum = req.params.datum;
    ErsatzautosModel.getVerfuegbarkeitDetails(datum, (err, details) => {
      if (err) {
        console.error('Fehler beim Abrufen der Verfügbarkeitsdetails:', err);
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      res.json(details);
    });
  },

  // Aktuelle Buchungen (heute und laufende)
  getAktuelleBuchungen: (req, res) => {
    ErsatzautosModel.getAktuelleBuchungen((err, buchungen) => {
      if (err) {
        console.error('Fehler beim Abrufen der aktuellen Buchungen:', err);
        return res.status(500).json({ error: 'Interner Serverfehler' });
      }
      res.json(buchungen);
    });
  }
};

module.exports = ersatzautosController;
