const express = require('express');
const router = express.Router();
const TabletUpdateController = require('../controllers/tabletUpdateController');

// Prüfe auf Updates (von Tablet aufgerufen)
router.get('/check', TabletUpdateController.checkUpdate);

// Download Update-Datei
router.get('/download', TabletUpdateController.downloadUpdate);

// Registriere neues Update (Admin)
router.post('/register', TabletUpdateController.registerUpdate);

// Update-Status aller Tablets abrufen
router.get('/status', TabletUpdateController.getUpdateStatus);

// Tablet meldet Status
router.post('/report-status', TabletUpdateController.reportStatus);

module.exports = router;
