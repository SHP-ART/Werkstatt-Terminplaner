const express = require('express');
const router = express.Router();
const LehrlingeController = require('../controllers/lehrlingeController');

router.get('/', LehrlingeController.getAll);
router.get('/aktive', LehrlingeController.getAktive);
router.get('/:id', LehrlingeController.getById);
router.post('/', LehrlingeController.create);
router.put('/:id', LehrlingeController.update);
router.delete('/:id', LehrlingeController.delete);

module.exports = router;


