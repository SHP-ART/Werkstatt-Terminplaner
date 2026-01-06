const express = require('express');
const router = express.Router();
const ArbeitszeitenController = require('../controllers/arbeitszeitenController');

router.get('/', ArbeitszeitenController.getAll);
router.post('/', ArbeitszeitenController.create);
router.put('/:id', ArbeitszeitenController.update);
router.delete('/:id', ArbeitszeitenController.delete);

module.exports = router;
