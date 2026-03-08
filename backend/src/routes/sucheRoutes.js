const express = require('express');
const router = express.Router();
const sucheController = require('../controllers/sucheController');

router.get('/', sucheController.suche);
router.get('/verlauf', sucheController.verlauf);

module.exports = router;
