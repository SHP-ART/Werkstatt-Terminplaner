const express = require('express');
const router = express.Router();
const TermineController = require('../controllers/termineController');

// WICHTIG: Spezifische Routes MÜSSEN vor Parameter-Routes stehen!

// Papierkorb-Routes
router.get('/papierkorb', TermineController.getDeleted);
router.post('/:id/restore', TermineController.restore);
router.delete('/:id/permanent', TermineController.permanentDelete);

// Schwebende Termine Route (GET für Liste, POST für einzelnen Termin setzen)
router.get('/schwebend', TermineController.getSchwebend);
router.post('/:id/schwebend', TermineController.setSchwebend);
router.post('/:id/split', TermineController.splitTermin);
router.get('/:id/split-termine', TermineController.getSplitTermine);

// Auftragserweiterung Routes
router.get('/erweiterung/verfuegbare-mitarbeiter', TermineController.findeVerfuegbareMitarbeiter);
router.get('/:id/erweiterung/konflikte', TermineController.pruefeErweiterungsKonflikte);
router.post('/:id/erweiterung', TermineController.erweiterungErstellen);
router.get('/:id/erweiterungen', TermineController.getErweiterungen);
router.get('/:id/erweiterungen/count', TermineController.countErweiterungen);

// Andere spezifische Routes
router.get('/verfuegbarkeit', TermineController.checkAvailability);
router.post('/validate', TermineController.validate);
router.get('/vorschlaege', TermineController.getVorschlaege);
router.get('/bringzeit-ueberschneidungen', TermineController.getBringzeitUeberschneidungen);
router.get('/duplikat-check', TermineController.checkDuplikate);

// Standard CRUD-Routes (müssen NACH spezifischen Routes stehen)
router.get('/', TermineController.getAll);
router.get('/:id', TermineController.getById);
router.post('/', TermineController.create);
router.put('/:id', TermineController.update);
router.delete('/:id', TermineController.delete); // Soft-Delete

module.exports = router;
