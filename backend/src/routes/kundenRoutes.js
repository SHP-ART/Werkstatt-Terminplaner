const express = require('express');
const router = express.Router();
const KundenController = require('../controllers/kundenController');

router.get('/', KundenController.getAll);
router.get('/search', KundenController.search);
router.get('/:id', KundenController.getById);
router.post('/', KundenController.create);
router.post('/import', KundenController.import);
router.put('/:id', KundenController.update);
router.delete('/:id', KundenController.delete);

module.exports = router;
