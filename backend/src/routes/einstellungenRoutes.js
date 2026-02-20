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

// KI-Funktionen aktivieren/deaktivieren
router.put('/ki-enabled', EinstellungenController.updateKIEnabled);
// Echtzeit-Updates aktivieren/deaktivieren
router.put('/realtime-enabled', EinstellungenController.updateRealtimeEnabled);
// Smart Scheduling aktivieren/deaktivieren
router.put('/smart-scheduling-enabled', EinstellungenController.updateSmartSchedulingEnabled);
// Anomalie-Erkennung aktivieren/deaktivieren
router.put('/anomaly-detection-enabled', EinstellungenController.updateAnomalyDetectionEnabled);
// KI-Modus aktualisieren
router.put('/ki-mode', EinstellungenController.updateKIMode);
// Externe KI-URL speichern
router.put('/ki-external-url', EinstellungenController.updateKIExternalUrl);
// Ollama-Modell speichern
router.put('/ollama-model', EinstellungenController.updateOllamaModel);

module.exports = router;
