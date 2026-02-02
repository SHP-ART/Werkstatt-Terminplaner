const express = require('express');
const router = express.Router();
const ArbeitszeitenPlanController = require('../controllers/arbeitszeitenPlanController');

// WICHTIG: Spezifische Routes MÜSSEN vor Parameter-Routes stehen!

// Abfrage-Routes
router.get('/', ArbeitszeitenPlanController.getAll);
router.get('/for-date', ArbeitszeitenPlanController.getForDate);
router.get('/range', ArbeitszeitenPlanController.getByDateRange);
router.get('/mitarbeiter/:id', ArbeitszeitenPlanController.getByMitarbeiterId);
router.get('/lehrling/:id', ArbeitszeitenPlanController.getByLehrlingId);

// Erstellen/Aktualisieren
router.post('/muster', ArbeitszeitenPlanController.upsertWochentagMuster);
router.post('/datum', ArbeitszeitenPlanController.createDateEntry);
router.put('/:id', ArbeitszeitenPlanController.update);

// Reset auf Standard
router.delete('/reset/:typ/:id', ArbeitszeitenPlanController.resetToStandard);

// Löschen & Einzelabruf (MÜSSEN als LETZTES stehen wegen /:id Konflikt!)
router.delete('/:id', ArbeitszeitenPlanController.delete);
router.get('/:id', ArbeitszeitenPlanController.getById);

module.exports = router;
