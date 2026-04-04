const express = require('express');
const router = express.Router();
const KundenController = require('../controllers/kundenController');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateKunde, validateKundenSearch, validateId } = require('../middleware/validation');

router.get('/', asyncHandler(KundenController.getAll));
router.get('/dropdown', asyncHandler(KundenController.getDropdownData));
router.get('/search', validateKundenSearch, asyncHandler(KundenController.search));
router.get('/search/fuzzy', asyncHandler(KundenController.fuzzySearch));
router.get('/stats/fahrzeuge', asyncHandler(KundenController.countFahrzeuge));
router.get('/:id', validateId, asyncHandler(KundenController.getById));
router.get('/:id/fahrzeuge', validateId, asyncHandler(KundenController.getFahrzeuge));
router.post('/', validateKunde, asyncHandler(KundenController.create));
router.post('/import', asyncHandler(KundenController.import));
router.post('/:id/fahrzeuge', validateId, asyncHandler(KundenController.addFahrzeug));
router.put('/:id', validateId, validateKunde, asyncHandler(KundenController.update));
router.put('/:id/fahrzeuge/:kennzeichen', validateId, asyncHandler(KundenController.updateFahrzeug));
router.delete('/:id', validateId, asyncHandler(KundenController.delete));
router.delete('/:id/fahrzeuge/:kennzeichen', validateId, asyncHandler(KundenController.deleteFahrzeug));

module.exports = router;
