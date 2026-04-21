const express = require('express');
const router = express.Router();
const reportingController = require('../controllers/reportingController');

router.get('/kpis', reportingController.getKPIs);
router.get('/mitarbeiter', reportingController.getMitarbeiterReport);
router.get('/trend', reportingController.getTrend);
router.get('/pausen', reportingController.getPausenReport);

module.exports = router;
