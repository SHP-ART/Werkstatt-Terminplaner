const express = require('express');
const router = express.Router();
const TabletController = require('../controllers/tabletController');

// Tablet-Display-Einstellungen abrufen
router.get('/einstellungen', TabletController.getEinstellungen);

// Tablet-Display-Einstellungen aktualisieren
router.put('/einstellungen', TabletController.updateEinstellungen);

// Manuellen Display-Status setzen (an/aus/auto)
router.put('/display-manuell', TabletController.setDisplayManuell);

module.exports = router;
