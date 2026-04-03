/**
 * Arbeitspausen Routes
 * API-Endpunkte für Arbeitspausenverwaltung
 */

const express = require('express');
const router = express.Router();
const ArbeitspausenController = require('../controllers/arbeitspausenController');

/**
 * POST /api/arbeitspausen/starten
 * Startet eine Arbeitspause für einen laufenden Termin
 *
 * Body:
 * - termin_id: ID des Termins
 * - mitarbeiter_id: ID des Mitarbeiters (mindestens mitarbeiter_id oder lehrling_id erforderlich)
 * - lehrling_id: ID des Lehrlings (mindestens mitarbeiter_id oder lehrling_id erforderlich)
 * - grund: Pausengrund ('teil_fehlt', 'rueckfrage_kunde', 'vorrang')
 */
router.post('/starten', ArbeitspausenController.starten);

/**
 * POST /api/arbeitspausen/beenden
 * Beendet die aktive Arbeitspause für einen Termin
 *
 * Body:
 * - termin_id: ID des Termins
 */
router.post('/beenden', ArbeitspausenController.beenden);

/**
 * GET /api/arbeitspausen/aktive
 * Gibt alle aktiven Arbeitspausen zurück (beendet_am IS NULL)
 */
router.get('/aktive', ArbeitspausenController.getAktive);

module.exports = router;
