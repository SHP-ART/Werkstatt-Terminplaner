const express = require('express');
const router = express.Router();
const TermineController = require('../controllers/termineController');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateTermin, validateId } = require('../middleware/validation');

// Papierkorb-Routes
router.get('/papierkorb', asyncHandler(TermineController.getDeleted));
router.get('/geloescht', asyncHandler(TermineController.getDeleted));
router.post('/:id/restore', validateId, asyncHandler(TermineController.restore));
router.delete('/:id/permanent', validateId, asyncHandler(TermineController.permanentDelete));

// Schwebende Termine
router.get('/schwebend', asyncHandler(TermineController.getSchwebend));
router.post('/:id/schwebend', validateId, asyncHandler(TermineController.setSchwebend));
router.post('/:id/split', validateId, asyncHandler(TermineController.splitTermin));
router.post('/:id/pause-split', validateId, asyncHandler(TermineController.pauseSplit));
router.get('/:id/split-termine', validateId, asyncHandler(TermineController.getSplitTermine));
router.post('/:id/weiterfuehren', validateId, asyncHandler(TermineController.weiterfuehren));
router.post('/:id/folgearbeit', validateId, asyncHandler(TermineController.folgearbeitErstellen));

// Auftragserweiterung
router.get('/erweiterung/verfuegbare-mitarbeiter', asyncHandler(TermineController.findeVerfuegbareMitarbeiter));
router.get('/:id/erweiterung/konflikte', validateId, asyncHandler(TermineController.pruefeErweiterungsKonflikte));
router.post('/:id/erweiterung', validateId, asyncHandler(TermineController.erweiterungErstellen));
router.get('/:id/erweiterungen', validateId, asyncHandler(TermineController.getErweiterungen));
router.get('/:id/erweiterungen/count', validateId, asyncHandler(TermineController.countErweiterungen));

// Automatisierung
router.get('/naechster-slot', asyncHandler(TermineController.getNaechsterSlot));
router.patch('/batch', asyncHandler(TermineController.batchUpdate));

// Spezifische Routes
router.get('/datum/:datum', asyncHandler(TermineController.getByDatumLegacy));
router.get('/auslastung/:datum', asyncHandler(TermineController.getAuslastung));
router.get('/verfuegbarkeit', asyncHandler(TermineController.checkAvailability));
router.post('/validate', asyncHandler(TermineController.validate));
router.get('/vorschlaege', asyncHandler(TermineController.getVorschlaege));
router.get('/bringzeit-ueberschneidungen', asyncHandler(TermineController.getBringzeitUeberschneidungen));
router.get('/aehnliche', asyncHandler(TermineController.getAehnliche));
router.get('/duplikat-check', asyncHandler(TermineController.checkDuplikate));
router.get('/teile-status', asyncHandler(TermineController.getTeileStatus));
router.get('/dropdown', asyncHandler(TermineController.getDropdownData));
router.post('/berechne-zeiten-neu', asyncHandler(TermineController.berechneZeitenNeu));

// Einzelarbeit
router.put('/:id/arbeit/:arbeitName/abschliessen', validateId, asyncHandler(TermineController.completeEinzelarbeit));
router.post('/:id/arbeit-beenden', validateId, asyncHandler(TermineController.arbeitBeendenByIndex));

// Standard CRUD
router.get('/', asyncHandler(TermineController.getAll));
router.get('/:id', validateId, asyncHandler(TermineController.getById));
router.post('/', validateTermin, asyncHandler(TermineController.create));
router.put('/:id', validateId, validateTermin, asyncHandler(TermineController.update));
router.delete('/:id', validateId, asyncHandler(TermineController.delete));

module.exports = router;
