const express = require('express');
const router = express.Router();
const TermineController = require('../controllers/termineController');

router.get('/', TermineController.getAll);
router.post('/', TermineController.create);
router.put('/:id', TermineController.update);
router.delete('/:id', TermineController.delete);
router.get('/verfuegbarkeit', TermineController.checkAvailability);
router.post('/validate', TermineController.validate);
router.get('/vorschlaege', TermineController.getVorschlaege);

module.exports = router;
