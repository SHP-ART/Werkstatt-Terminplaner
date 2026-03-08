/**
 * System Routes
 * 
 * API-Endpoints für System-Level-Operationen:
 * - Migrations-Status und -Management
 * - Schema-Informationen
 * - Health-Checks
 */

const express = require('express');
const router = express.Router();
const SystemController = require('../controllers/systemController');

// Migrations-Status
router.get('/migration-status', SystemController.getMigrationStatus);

// Dry-Run für ausstehende Migrationen
router.post('/migration/dry-run', SystemController.runDryRun);

// Alle Migrationen auflisten
router.get('/migrations/all', SystemController.getAllMigrationsList);

// Schema-Informationen
router.get('/schema-info', SystemController.getSchemaInfo);

// Server-Update auslösen (Linux only)
router.post('/update', SystemController.triggerUpdate);

// Verfügbare Updates prüfen (git fetch + log)
router.get('/update-check', SystemController.checkForUpdates);

// Update-Log lesen
router.get('/update-log', SystemController.getUpdateLog);

// Nur Service-Neustart (ohne git pull)
router.post('/restart', SystemController.restartService);

// Server herunterfahren (systemctl poweroff) – nur Linux
router.post('/shutdown', SystemController.shutdownServer);

// Shutdown-Log lesen (für Debugging)
router.get('/shutdown-log', (req, res) => {
  const fs = require('fs');
  try {
    const log = fs.existsSync('/tmp/werkstatt-shutdown.log')
      ? fs.readFileSync('/tmp/werkstatt-shutdown.log', 'utf8')
      : '(kein Log vorhanden)';
    res.json({ log });
  } catch (e) {
    res.json({ log: e.message });
  }
});

// Frontend neu bauen (npm run build) – nutzt process.execPath für npm
router.post('/build-frontend', SystemController.buildFrontend);

module.exports = router;
