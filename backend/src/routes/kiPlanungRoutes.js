const express = require('express');
const router = express.Router();
const KIPlanungController = require('../controllers/kiPlanungController');

// KI-Planungsvorschlag für einen Tag
router.get('/tagesplanung/:datum', KIPlanungController.getPlanungsvorschlag);

// KI-Vorschlag für Wochenverteilung schwebender Termine
router.get('/wochenplanung/:startDatum', KIPlanungController.getWochenvorschlag);

// Hintergrund-Job-Status abfragen (für Ollama-Langläufer)
router.get('/job/:jobId', KIPlanungController.getJobStatus);

// Schneller Anomalien-Check für einen Tag (kein Ollama, sofort)
router.get('/anomalien/:datum', KIPlanungController.getAnomalienFuerDatum);

module.exports = router;
