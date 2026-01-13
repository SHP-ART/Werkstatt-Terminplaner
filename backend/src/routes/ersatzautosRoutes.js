const express = require('express');
const router = express.Router();
const ersatzautosController = require('../controllers/ersatzautosController');

// Alle Ersatzautos abrufen
router.get('/', ersatzautosController.getAll);

// Nur aktive Ersatzautos
router.get('/aktiv', ersatzautosController.getActive);

// Aktuelle Buchungen (heute und laufende)
router.get('/buchungen/aktuell', ersatzautosController.getAktuelleBuchungen);

// Buchungen im Zeitraum prüfen (für Sperrwarnung)
router.get('/buchungen/zeitraum', ersatzautosController.getBuchungenImZeitraum);

// Heute fällige Rückgaben
router.get('/rueckgaben/heute', ersatzautosController.getHeuteRueckgaben);

// Verfügbarkeit für Datum
router.get('/verfuegbarkeit/:datum', ersatzautosController.getVerfuegbarkeit);

// Detaillierte Verfügbarkeit für Datum
router.get('/verfuegbarkeit/:datum/details', ersatzautosController.getVerfuegbarkeitDetails);

// Manuelle Sperrung umschalten (Toggle)
router.post('/:id/toggle-gesperrt', ersatzautosController.toggleManuellGesperrt);

// Manuelle Sperrung direkt setzen
router.put('/:id/gesperrt', ersatzautosController.setManuellGesperrt);

// Zeitbasierte Sperrung setzen (sperren bis zu einem bestimmten Datum)
router.post('/:id/sperren-bis', ersatzautosController.sperrenBis);

// Sperrung aufheben
router.post('/:id/entsperren', ersatzautosController.entsperren);

// Buchung (Termin) als früh zurückgegeben markieren
router.post('/buchung/:terminId/zurueckgegeben', ersatzautosController.markiereAlsZurueckgegeben);

// Einzelnes Ersatzauto abrufen
router.get('/:id', ersatzautosController.getById);

// Neues Ersatzauto anlegen
router.post('/', ersatzautosController.create);

// Ersatzauto aktualisieren
router.put('/:id', ersatzautosController.update);

// Ersatzauto löschen
router.delete('/:id', ersatzautosController.delete);

module.exports = router;
