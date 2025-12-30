const express = require('express');
const router = express.Router();
const TermineController = require('../controllers/termineController');

// WICHTIG: Spezifische Routes MÜSSEN vor Parameter-Routes stehen!

// Papierkorb-Routes
router.get('/papierkorb', TermineController.getDeleted);
router.post('/:id/restore', TermineController.restore);
router.delete('/:id/permanent', TermineController.permanentDelete);

// Termin-Split und Schwebend Routes
router.post('/:id/schwebend', TermineController.setSchwebend);
router.post('/:id/split', TermineController.splitTermin);
router.get('/:id/split-termine', TermineController.getSplitTermine);

// Andere spezifische Routes
router.get('/verfuegbarkeit', TermineController.checkAvailability);
router.post('/validate', TermineController.validate);
router.get('/vorschlaege', TermineController.getVorschlaege);

// Standard CRUD-Routes (müssen NACH spezifischen Routes stehen)
router.get('/', TermineController.getAll);
router.post('/', TermineController.create);
router.put('/:id', TermineController.update);
router.delete('/:id', TermineController.delete); // Soft-Delete

module.exports = router;
