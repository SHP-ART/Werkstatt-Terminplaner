const express = require('express');
const router = express.Router();
const { VERSION, APP_NAME } = require('../config/version');

const kundenRoutes = require('./kundenRoutes');
const termineRoutes = require('./termineRoutes');
const arbeitszeitenRoutes = require('./arbeitszeitenRoutes');
const auslastungRoutes = require('./auslastungRoutes');
const einstellungenRoutes = require('./einstellungenRoutes');
const abwesenheitenRoutes = require('./abwesenheitenRoutes');
const arbeitszeitenPlanRoutes = require('./arbeitszeitenPlanRoutes');
const schichtTemplateRoutes = require('./schichtTemplateRoutes');
const backupRoutes = require('./backupRoutes');
const mitarbeiterRoutes = require('./mitarbeiterRoutes');
const lehrlingeRoutes = require('./lehrlingeRoutes');
const ersatzautosRoutes = require('./ersatzautosRoutes');
const phasenRoutes = require('./phasenRoutes');
const aiRoutes = require('./aiRoutes');
const teileRoutes = require('./teileRoutes');
const fahrzeugeRoutes = require('./fahrzeuge');
const kiPlanungRoutes = require('./kiPlanungRoutes');
const tabletRoutes = require('./tabletRoutes');

router.use('/kunden', kundenRoutes);
router.use('/termine', termineRoutes);
router.use('/arbeitszeiten', arbeitszeitenRoutes);
router.use('/auslastung', auslastungRoutes);
router.use('/einstellungen', einstellungenRoutes);
router.use('/abwesenheiten', abwesenheitenRoutes);
router.use('/arbeitszeiten-plan', arbeitszeitenPlanRoutes);
router.use('/schicht-templates', schichtTemplateRoutes);
router.use('/backup', backupRoutes);
router.use('/mitarbeiter', mitarbeiterRoutes);
router.use('/lehrlinge', lehrlingeRoutes);
router.use('/ersatzautos', ersatzautosRoutes);
router.use('/phasen', phasenRoutes);
router.use('/ai', aiRoutes);
router.use('/teile-bestellungen', teileRoutes);
router.use('/fahrzeuge', fahrzeugeRoutes);
router.use('/ki-planung', kiPlanungRoutes);
router.use('/tablet', tabletRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Server-Info Endpoint für automatische API-Erkennung
router.get('/server-info', (req, res) => {
  const os = require('os');
  
  // Ermittle die IP-Adresse des Servers
  function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }
  
  const port = process.env.PORT || 3001;
  const ip = getLocalIPAddress();
  
  res.json({
    status: 'OK',
    version: VERSION,
    appName: APP_NAME,
    ip: ip,
    port: port,
    apiUrl: `http://${ip}:${port}/api`,
    frontendUrl: `http://${ip}:${port}`,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
