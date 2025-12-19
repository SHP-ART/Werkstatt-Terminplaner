const express = require('express');
const router = express.Router();
const AbwesenheitenController = require('../controllers/abwesenheitenController');

router.get('/:datum', AbwesenheitenController.getByDatum);
router.put('/:datum', AbwesenheitenController.upsert);

module.exports = router;
