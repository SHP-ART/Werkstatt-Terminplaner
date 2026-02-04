/**
 * Pause Routes
 * API-Endpunkte für Pausenverwaltung
 */

const express = require('express');
const router = express.Router();
const PauseController = require('../controllers/pauseController');

/**
 * POST /api/pause/starten
 * Startet eine Pause für Mitarbeiter/Lehrling
 * 
 * Body:
 * - personId: ID des Mitarbeiters/Lehrlings
 * - personTyp: 'mitarbeiter' oder 'lehrling'
 * - datum: Datum im Format YYYY-MM-DD
 */
router.post('/starten', PauseController.starten);

/**
 * GET /api/pause/aktive
 * Gibt alle aktiven Pausen zurück (abgeschlossen=0)
 */
router.get('/aktive', PauseController.getAktive);

module.exports = router;
