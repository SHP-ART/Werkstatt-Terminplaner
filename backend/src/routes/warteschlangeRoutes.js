const express = require('express');
const router = express.Router();
const WarteschlangeController = require('../controllers/warteschlangeController');
const { asyncHandler } = require('../middleware/errorHandler');
const { generalLimiter } = require('../middleware/rateLimiter');

router.get('/', generalLimiter, asyncHandler(WarteschlangeController.get));
router.get('/mitarbeiter/:id/naechster', generalLimiter, asyncHandler(WarteschlangeController.getNaechster));
router.put('/zuweisen', generalLimiter, asyncHandler(WarteschlangeController.zuweisen));
router.put('/reihenfolge', generalLimiter, asyncHandler(WarteschlangeController.reihenfolge));
router.post('/:terminId/naechster-tag', generalLimiter, asyncHandler(WarteschlangeController.naechsterTag));

module.exports = router;
