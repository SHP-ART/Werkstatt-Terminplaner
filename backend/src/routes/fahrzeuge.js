const express = require('express');
const router = express.Router();
const fahrzeugeController = require('../controllers/fahrzeugeController');

/**
 * Fahrzeuge API-Routen
 * 
 * Endpunkte:
 * GET    /api/fahrzeuge              - Alle Fahrzeuge abrufen
 * GET    /api/fahrzeuge/search       - Fahrzeuge suchen (query: ?q=suchbegriff)
 * GET    /api/fahrzeuge/vin/:vin     - Fahrzeug nach VIN suchen
 * GET    /api/fahrzeuge/kennzeichen/:kennzeichen - Fahrzeug nach Kennzeichen
 * GET    /api/fahrzeuge/kunde/:kundeId - Alle Fahrzeuge eines Kunden
 * GET    /api/fahrzeuge/:id          - Einzelnes Fahrzeug nach ID
 * POST   /api/fahrzeuge              - Neues Fahrzeug erstellen
 * POST   /api/fahrzeuge/decode       - VIN dekodieren und optional speichern
 * POST   /api/fahrzeuge/lookup       - VIN in DB suchen, sonst dekodieren
 * PUT    /api/fahrzeuge/:id          - Fahrzeug aktualisieren
 * DELETE /api/fahrzeuge/:id          - Fahrzeug löschen
 */

// Suche (muss vor /:id kommen)
router.get('/search', fahrzeugeController.search);

// VIN-Lookup (DB oder Decoder)
router.post('/lookup', fahrzeugeController.vinLookup);

// VIN dekodieren (optional speichern)
router.post('/decode', fahrzeugeController.decodeAndSave);

// Nach VIN suchen
router.get('/vin/:vin', fahrzeugeController.getByVin);

// Nach Kennzeichen suchen
router.get('/kennzeichen/:kennzeichen', fahrzeugeController.getByKennzeichen);

// Fahrzeuge eines Kunden
router.get('/kunde/:kundeId', fahrzeugeController.getByKunde);

// Alle Fahrzeuge
router.get('/', fahrzeugeController.getAll);

// Einzelnes Fahrzeug
router.get('/:id', fahrzeugeController.getById);

// Neues Fahrzeug
router.post('/', fahrzeugeController.create);

// Fahrzeug aktualisieren
router.put('/:id', fahrzeugeController.update);

// Fahrzeug löschen
router.delete('/:id', fahrzeugeController.delete);

module.exports = router;
