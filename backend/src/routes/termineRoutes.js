const express = require('express');
const router = express.Router();
const TermineController = require('../controllers/termineController');

router.get('/', TermineController.getAll);
router.post('/', TermineController.create);
router.put('/:id', TermineController.update);
router.delete('/:id', TermineController.delete);

module.exports = router;
