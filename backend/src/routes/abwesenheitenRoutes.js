const express = require('express');
const router = express.Router();
const AbwesenheitenController = require('../controllers/abwesenheitenController');

// WICHTIG: Spezifische Routes MÜSSEN vor Parameter-Routes stehen!

// Neue Routes für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
router.get('/liste', AbwesenheitenController.getAll);
router.get('/range', AbwesenheitenController.getByDateRange);
router.post('/', AbwesenheitenController.create);

// Legacy-Routes für alte Abwesenheiten-Tabelle
router.get('/legacy/:datum', AbwesenheitenController.getByDatum);
router.put('/legacy/:datum', AbwesenheitenController.upsert);

// DELETE und einzelne ID-Abfrage für neue Abwesenheiten
router.delete('/item/:id', AbwesenheitenController.delete);
router.get('/item/:id', AbwesenheitenController.getById);

// Backward compatibility - alte Routes für Datum-basiert (MUSS am Ende stehen!)
router.get('/:datum', AbwesenheitenController.getByDatum);
router.put('/:datum', AbwesenheitenController.upsert);

module.exports = router;
