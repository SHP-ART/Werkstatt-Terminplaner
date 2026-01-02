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
const ersatzautosRoutes = require('./ersatzautosRoutes');
const phasenRoutes = require('./phasenRoutes');

router.use('/kunden', kundenRoutes);
router.use('/termine', termineRoutes);
router.use('/arbeitszeiten', arbeitszeitenRoutes);
router.use('/auslastung', auslastungRoutes);
router.use('/einstellungen', einstellungenRoutes);
router.use('/abwesenheiten', abwesenheitenRoutes);
router.use('/backup', backupRoutes);
router.use('/mitarbeiter', mitarbeiterRoutes);
router.use('/lehrlinge', lehrlingeRoutes);
router.use('/ersatzautos', ersatzautosRoutes);
router.use('/phasen', phasenRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Server-Info Endpoint für automatische API-Erkennung
router.get('/server-info', (req, res) => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  
  // Version aus package.json lesen
  let version = 'unbekannt';
  try {
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      version = pkg.version;
    }
  } catch (e) {
    console.error('Fehler beim Lesen der Version:', e);
  }
  
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
    version: version,
    ip: ip,
    port: port,
    apiUrl: `http://${ip}:${port}/api`,
    frontendUrl: `http://${ip}:${port}`,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
