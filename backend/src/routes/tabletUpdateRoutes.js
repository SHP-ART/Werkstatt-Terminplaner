const express = require('express');
const router = express.Router();
const TabletUpdateController = require('../controllers/tabletUpdateController');
const { requireAuth } = require('../middleware/auth');

// ── Öffentlich (auch alte Tablet-Builds ohne API-Key-Support können) ──
// Prüfe auf Updates (von Tablet aufgerufen)
router.get('/check', TabletUpdateController.checkUpdate);

// Download Update-Datei (liefert nur bereits registrierte Dateien)
router.get('/download', TabletUpdateController.downloadUpdate);

// Tablet meldet Status (Hostname/IP/Version)
router.post('/report-status', TabletUpdateController.reportStatus);

// ── Admin-geschützt ──
// Registriere neues Update — verhindert fremde Update-Einschleusung
router.post('/register', requireAuth, TabletUpdateController.registerUpdate);

// Update-Status aller Tablets abrufen — enthält Hostnames/IPs
router.get('/status', requireAuth, TabletUpdateController.getUpdateStatus);

module.exports = router;
