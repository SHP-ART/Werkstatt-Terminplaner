const express = require('express');
const router = express.Router();
const MitarbeiterController = require('../controllers/mitarbeiterController');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateMitarbeiter, validateId } = require('../middleware/validation');

router.get('/', asyncHandler(MitarbeiterController.getAll));
router.get('/aktive', asyncHandler(MitarbeiterController.getAktive));
router.get('/:id', validateId, asyncHandler(MitarbeiterController.getById));
router.post('/', validateMitarbeiter, asyncHandler(MitarbeiterController.create));
router.put('/:id', validateId, validateMitarbeiter, asyncHandler(MitarbeiterController.update));
router.delete('/:id', validateId, asyncHandler(MitarbeiterController.delete));

module.exports = router;
