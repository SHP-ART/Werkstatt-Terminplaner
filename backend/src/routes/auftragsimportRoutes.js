const express = require('express');
const router = express.Router();
const AuftragsimportController = require('../controllers/auftragsimportController');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { generalLimiter, systemLimiter } = require('../middleware/rateLimiter');

router.get('/', generalLimiter, asyncHandler(AuftragsimportController.getAll));
router.get('/:id', generalLimiter, asyncHandler(AuftragsimportController.getById));

router.post('/scan', requireAuth, systemLimiter, asyncHandler(AuftragsimportController.scan));
router.post('/:id/schnelltermin', requireAuth, generalLimiter, asyncHandler(AuftragsimportController.createSchnelltermin));
router.post('/:id/softstart', requireAuth, generalLimiter, asyncHandler(AuftragsimportController.softstart));
router.post('/:id/zuordnen', requireAuth, generalLimiter, asyncHandler(AuftragsimportController.assignToTermin));
router.post('/:id/locosoft-pruefen', requireAuth, generalLimiter, asyncHandler(AuftragsimportController.moveToLocosoftPruefen));
router.post('/:id/verwerfen', requireAuth, generalLimiter, asyncHandler(AuftragsimportController.discard));

module.exports = router;
