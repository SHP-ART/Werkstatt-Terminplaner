const express = require('express');
const router = express.Router();
const KundenController = require('../controllers/kundenController');

router.get('/', KundenController.getAll);
router.get('/dropdown', KundenController.getDropdownData);
router.get('/search', KundenController.search);
router.get('/search/fuzzy', KundenController.fuzzySearch);
router.get('/stats/fahrzeuge', KundenController.countFahrzeuge);
router.get('/:id', KundenController.getById);
router.get('/:id/fahrzeuge', KundenController.getFahrzeuge);
router.post('/', KundenController.create);
router.post('/import', KundenController.import);
router.post('/:id/fahrzeuge', KundenController.addFahrzeug);
router.put('/:id', KundenController.update);
router.put('/:id/fahrzeuge/:kennzeichen', KundenController.updateFahrzeug);
router.delete('/:id', KundenController.delete);
router.delete('/:id/fahrzeuge/:kennzeichen', KundenController.deleteFahrzeug);

module.exports = router;
