const express = require('express');
const router = express.Router();
const ersatzautosController = require('../controllers/ersatzautosController');

// Alle Ersatzautos abrufen
router.get('/', ersatzautosController.getAll);

// Nur aktive Ersatzautos
router.get('/aktiv', ersatzautosController.getActive);

// Aktuelle Buchungen (heute und laufende)
router.get('/buchungen/aktuell', ersatzautosController.getAktuelleBuchungen);

// Verfügbarkeit für Datum
router.get('/verfuegbarkeit/:datum', ersatzautosController.getVerfuegbarkeit);

// Detaillierte Verfügbarkeit für Datum
router.get('/verfuegbarkeit/:datum/details', ersatzautosController.getVerfuegbarkeitDetails);

// Einzelnes Ersatzauto abrufen
router.get('/:id', ersatzautosController.getById);

// Neues Ersatzauto anlegen
router.post('/', ersatzautosController.create);

// Ersatzauto aktualisieren
router.put('/:id', ersatzautosController.update);

// Ersatzauto löschen
router.delete('/:id', ersatzautosController.delete);

module.exports = router;
