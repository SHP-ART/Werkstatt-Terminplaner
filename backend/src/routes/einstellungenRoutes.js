const express = require('express');
const router = express.Router();
const EinstellungenController = require('../controllers/einstellungenController');

router.get('/datenbank-pfad', EinstellungenController.getDatenbankPfad);
router.get('/werkstatt', EinstellungenController.getWerkstatt);
router.put('/werkstatt', EinstellungenController.updateWerkstatt);
router.get('/ersatzauto/:datum', EinstellungenController.getErsatzautoVerfuegbarkeit);

// ChatGPT API-Key Routen
router.put('/chatgpt-api-key', EinstellungenController.updateChatGPTApiKey);
router.delete('/chatgpt-api-key', EinstellungenController.deleteChatGPTApiKey);
router.get('/chatgpt-api-key/test', EinstellungenController.testChatGPTApiKey);

module.exports = router;
