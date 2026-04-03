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
 * - mitarbeiter_id: ID des Mitarbeiters (optional, wenn keine lehrling_id)
 * - lehrling_id: ID des Lehrlings (optional, wenn keine mitarbeiter_id)
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
