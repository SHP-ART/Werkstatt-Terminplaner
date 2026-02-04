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

module.exports = router;
