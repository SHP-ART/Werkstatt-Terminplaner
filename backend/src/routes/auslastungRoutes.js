const express = require('express');
const router = express.Router();
const TermineController = require('../controllers/termineController');

router.get('/:datum', TermineController.getAuslastung);

module.exports = router;
