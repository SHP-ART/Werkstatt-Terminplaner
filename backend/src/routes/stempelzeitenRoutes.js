const express = require('express');
const router = express.Router();
const StempelzeitenController = require('../controllers/stempelzeitenController');

router.get('/', StempelzeitenController.getTagUebersicht);
router.put('/stempel', StempelzeitenController.setStempel);

module.exports = router;
