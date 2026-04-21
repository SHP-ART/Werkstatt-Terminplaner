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

/**
 * GET /api/pause/heute
 * Gibt alle Pausen von heute zurück (aktive und abgeschlossene)
 */
router.get('/heute', PauseController.getHeute);

/**
 * POST /api/pause/beenden
 * Beendet die aktive Pause einer Person manuell.
 */
router.post('/beenden', PauseController.beenden);

module.exports = router;
