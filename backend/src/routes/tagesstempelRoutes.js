const express = require('express');
const router = express.Router();
const TagesstempelController = require('../controllers/tagesstempelController');

router.get('/', TagesstempelController.getByDatum);
router.post('/kommen', TagesstempelController.kommen);
router.post('/gehen', TagesstempelController.gehen);
router.post('/gehen/bestaetigen', TagesstempelController.gehenBestaetigen);
router.post('/unterbrechung/start', TagesstempelController.unterbrechungStart);
router.post('/unterbrechung/ende', TagesstempelController.unterbrechungEnde);

module.exports = router;
