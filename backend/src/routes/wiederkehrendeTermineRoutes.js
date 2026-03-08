const express = require('express');
const router = express.Router();
const WiederkehrendeTermineController = require('../controllers/wiederkehrendeTermineController');

router.get('/', WiederkehrendeTermineController.getAll);
router.post('/', WiederkehrendeTermineController.create);
router.put('/:id', WiederkehrendeTermineController.update);
router.delete('/:id', WiederkehrendeTermineController.delete);

module.exports = router;
