const express = require('express');
const router = express.Router();
const SchichtTemplateController = require('../controllers/schichtTemplateController');

// GET alle Templates
router.get('/', SchichtTemplateController.getAll);

// GET einzelnes Template
router.get('/:id', SchichtTemplateController.getById);

// POST neues Template
router.post('/', SchichtTemplateController.create);

// PUT Template aktualisieren
router.put('/:id', SchichtTemplateController.update);

// DELETE Template
router.delete('/:id', SchichtTemplateController.delete);

module.exports = router;
