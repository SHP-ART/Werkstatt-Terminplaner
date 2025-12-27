const express = require('express');
const router = express.Router();

const kundenRoutes = require('./kundenRoutes');
const termineRoutes = require('./termineRoutes');
const arbeitszeitenRoutes = require('./arbeitszeitenRoutes');
const auslastungRoutes = require('./auslastungRoutes');
const einstellungenRoutes = require('./einstellungenRoutes');
const abwesenheitenRoutes = require('./abwesenheitenRoutes');
const backupRoutes = require('./backupRoutes');
const mitarbeiterRoutes = require('./mitarbeiterRoutes');
const lehrlingeRoutes = require('./lehrlingeRoutes');

router.use('/kunden', kundenRoutes);
router.use('/termine', termineRoutes);
router.use('/arbeitszeiten', arbeitszeitenRoutes);
router.use('/auslastung', auslastungRoutes);
router.use('/einstellungen', einstellungenRoutes);
router.use('/abwesenheiten', abwesenheitenRoutes);
router.use('/backup', backupRoutes);
router.use('/mitarbeiter', mitarbeiterRoutes);
router.use('/lehrlinge', lehrlingeRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

module.exports = router;
