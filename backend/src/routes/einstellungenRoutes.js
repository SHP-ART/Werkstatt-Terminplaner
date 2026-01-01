const express = require('express');
const router = express.Router();
const EinstellungenController = require('../controllers/einstellungenController');

router.get('/werkstatt', EinstellungenController.getWerkstatt);
router.put('/werkstatt', EinstellungenController.updateWerkstatt);
router.get('/ersatzauto/:datum', EinstellungenController.getErsatzautoVerfuegbarkeit);

module.exports = router;
