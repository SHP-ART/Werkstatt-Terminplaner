/**
 * Teile-Bestellungen Routes
 * API-Endpunkte für Teile-Bestellungen
 */

const express = require('express');
const router = express.Router();
const teileController = require('../controllers/teileController');

// GET /api/teile-bestellungen - Alle Bestellungen
router.get('/', teileController.getAll);

// GET /api/teile-bestellungen/statistik - Statistiken
router.get('/statistik', teileController.getStatistik);

// GET /api/teile-bestellungen/faellig - Fällige Bestellungen
router.get('/faellig', teileController.getFaellige);

// GET /api/teile-bestellungen/termin/:id - Bestellungen für Termin
router.get('/termin/:id', teileController.getByTermin);

// GET /api/teile-bestellungen/:id - Einzelne Bestellung
router.get('/:id', teileController.getById);

// POST /api/teile-bestellungen - Neue Bestellung
router.post('/', teileController.create);

// POST /api/teile-bestellungen/bulk - Mehrere Bestellungen
router.post('/bulk', teileController.createBulk);

// PUT /api/teile-bestellungen/mark-bestellt - Mehrere als bestellt
router.put('/mark-bestellt', teileController.markAlsBestellt);

// PUT /api/teile-bestellungen/:id - Bestellung aktualisieren
router.put('/:id', teileController.update);

// PUT /api/teile-bestellungen/:id/status - Status ändern
router.put('/:id/status', teileController.updateStatus);

// DELETE /api/teile-bestellungen/:id - Bestellung löschen
router.delete('/:id', teileController.remove);

module.exports = router;
