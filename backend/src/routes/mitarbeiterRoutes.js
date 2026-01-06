const express = require('express');
const router = express.Router();
const MitarbeiterController = require('../controllers/mitarbeiterController');

router.get('/', MitarbeiterController.getAll);
router.get('/aktive', MitarbeiterController.getAktive);
router.get('/:id', MitarbeiterController.getById);
router.post('/', MitarbeiterController.create);
router.put('/:id', MitarbeiterController.update);
router.delete('/:id', MitarbeiterController.delete);

module.exports = router;


