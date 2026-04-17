const express = require('express');
const router = express.Router();
const AuslastungController = require('../controllers/auslastungController');

router.get('/:datum', AuslastungController.getAuslastung);

module.exports = router;
