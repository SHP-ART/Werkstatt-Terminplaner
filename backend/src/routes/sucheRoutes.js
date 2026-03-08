const express = require('express');
const router = express.Router();
const sucheController = require('../controllers/sucheController');

router.get('/', sucheController.suche);

module.exports = router;
