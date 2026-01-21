const express = require('express');
const router = express.Router();
const PhasenController = require('../controllers/phasenController');

// Alle Phasen abrufen
router.get('/', PhasenController.getAll);

// Phasen für ein Datum abrufen (für Auslastung)
router.get('/datum/:datum', PhasenController.getByDatum);

// Phasen eines Termins abrufen
router.get('/termin/:terminId', PhasenController.getByTerminId);

// Phasen eines Termins synchronisieren (alle löschen + neu erstellen)
router.put('/termin/:terminId/sync', PhasenController.syncPhasen);

// Einzelne Phase abrufen
router.get('/:id', PhasenController.getById);

// Neue Phase erstellen
router.post('/', PhasenController.create);

// Phase aktualisieren
router.put('/:id', PhasenController.update);

// Phase löschen
router.delete('/:id', PhasenController.delete);

module.exports = router;
