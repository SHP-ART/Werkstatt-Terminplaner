const express = require('express');
const router = express.Router();
const AbwesenheitenController = require('../controllers/abwesenheitenController');

// WICHTIG: Spezifische Routes MÜSSEN vor Parameter-Routes stehen!

// Neue Routes für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
router.get('/', AbwesenheitenController.getAll);
router.get('/liste', AbwesenheitenController.getAll);
router.get('/range', AbwesenheitenController.getByDateRange);
router.get('/datum/:datum', AbwesenheitenController.getForDate);
router.get('/mitarbeiter/:id', AbwesenheitenController.getByMitarbeiterId);
router.get('/lehrling/:id', AbwesenheitenController.getByLehrlingId);
router.post('/', AbwesenheitenController.create);
router.put('/:id', AbwesenheitenController.update);
router.delete('/:id', AbwesenheitenController.delete);
router.get('/:id', AbwesenheitenController.getById);

// Legacy-Routes für alte Abwesenheiten-Tabelle
router.get('/legacy/:datum', AbwesenheitenController.getByDatum);
router.put('/legacy/:datum', AbwesenheitenController.upsert);

module.exports = router;
