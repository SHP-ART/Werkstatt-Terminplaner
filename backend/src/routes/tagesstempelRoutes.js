const express = require('express');
const router = express.Router();
const TagesstempelController = require('../controllers/tagesstempelController');

router.get('/', TagesstempelController.getByDatum);
router.post('/kommen', TagesstempelController.kommen);
router.post('/gehen', TagesstempelController.gehen);
router.post('/gehen/bestaetigen', TagesstempelController.gehenBestaetigen);
router.post('/unterbrechung/start', TagesstempelController.unterbrechungStart);
router.post('/unterbrechung/ende', TagesstempelController.unterbrechungEnde);
router.patch('/zeiten', TagesstempelController.updateZeiten);
router.delete('/:id', TagesstempelController.deleteTagesstempel);
router.patch('/unterbrechung/:id', TagesstempelController.updateUnterbrechung);
router.post('/pause', TagesstempelController.createPause);
router.patch('/pause/:id', TagesstempelController.updatePause);

module.exports = router;
