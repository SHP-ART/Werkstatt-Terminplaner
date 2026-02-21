/**
 * System Controller
 * 
 * Verwaltet System-Level-Operationen:
 * - Migrations-Status
 * - Dry-Run-Migrationen
 * - Schema-Informationen
 * - Health-Checks
 */

const { 
  getSchemaVersion, 
  verifySchemaIntegrity,
  calculateSchemaChecksum,
  migrationLock,
  dbWrapper
} = require('../config/database');

const { 
  getLatestVersion, 
  hasPendingMigrations, 
  getPendingMigrations,
  getAllMigrations,
  runMigrations
} = require('../../migrations');

class SystemController {
  /**
   * GET /api/system/migration-status
   * Gibt aktuellen Migrations-Status zurück
   */
  static async getMigrationStatus(req, res) {
    try {
      await dbWrapper.readyPromise;
      
      const currentVersion = await getSchemaVersion();
      const latestVersion = getLatestVersion();
      const pending = getPendingMigrations(currentVersion);
      const schemaChecksum = await calculateSchemaChecksum();
      
      // Prüfe Schema-Integrität
      const integrityOk = await verifySchemaIntegrity();
      
      // Migration-Lock-Status
      const lockStatus = {
        locked: migrationLock.locked,
        lockedBy: migrationLock.lockedBy,
        lockedAt: migrationLock.lockedAt
      };
      
      res.json({
        status: 'ok',
        schema: {
          currentVersion,
          latestVersion,
          isUpToDate: currentVersion >= latestVersion,
          checksum: schemaChecksum.substring(0, 16) + '...',
          integrityOk
        },
        migrations: {
          total: latestVersion,
          pending: pending.length,
          pendingList: pending.map(m => ({
            version: m.version,
            description: m.description
          }))
        },
        lock: lockStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Fehler bei getMigrationStatus:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  /**
   * POST /api/system/migration/dry-run
   * Führt Dry-Run für ausstehende Migrationen durch
   */
  static async runDryRun(req, res) {
    try {
      await dbWrapper.readyPromise;
      
      const currentVersion = await getSchemaVersion();
      const pending = getPendingMigrations(currentVersion);
      
      if (pending.length === 0) {
        return res.json({
          status: 'ok',
          message: 'Keine ausstehenden Migrationen',
          migrations: []
        });
      }
      
      console.log(`🧪 Starte Dry-Run für ${pending.length} Migration(en)...`);
      
      // Führe Migrationen im Dry-Run-Modus aus
      const startTime = Date.now();
      await runMigrations(dbWrapper.connection, currentVersion, { dryRun: true });
      const duration = Date.now() - startTime;
      
      res.json({
        status: 'ok',
        message: `Dry-Run erfolgreich: ${pending.length} Migration(en) getestet`,
        migrations: pending.map(m => ({
          version: m.version,
          description: m.description
        })),
        duration,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Fehler bei Dry-Run:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
        error: error.code || 'DRY_RUN_FAILED'
      });
    }
  }

  /**
   * GET /api/system/migrations/all
   * Gibt alle Migrationen zurück (für Dokumentationszwecke)
   */
  static async getAllMigrationsList(req, res) {
    try {
      const currentVersion = await getSchemaVersion();
      const allMigrations = getAllMigrations();
      
      const migrationsList = allMigrations.map(m => ({
        version: m.version,
        description: m.description,
        status: m.version <= currentVersion ? 'completed' : 'pending',
        hasRollback: typeof m.down === 'function'
      }));
      
      res.json({
        status: 'ok',
        currentVersion,
        migrations: migrationsList,
        total: allMigrations.length
      });
    } catch (error) {
      console.error('Fehler bei getAllMigrationsList:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  /**
   * GET /api/system/schema-info
   * Gibt Schema-Informationen zurück
   */
  static async getSchemaInfo(req, res) {
    try {
      await dbWrapper.readyPromise;
      
      // Alle Tabellen abfragen
      const tables = await new Promise((resolve, reject) => {
        dbWrapper.connection.all(
          `SELECT name, sql FROM sqlite_master 
           WHERE type = 'table' 
           AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          }
        );
      });
      
      // Indizes abfragen
      const indices = await new Promise((resolve, reject) => {
        dbWrapper.connection.all(
          `SELECT name, tbl_name, sql FROM sqlite_master 
           WHERE type = 'index' 
           AND name NOT LIKE 'sqlite_%'
           ORDER BY tbl_name, name`,
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          }
        );
      });
      
      const checksum = await calculateSchemaChecksum();
      
      res.json({
        status: 'ok',
        schema: {
          tables: tables.map(t => ({ name: t.name, sql: t.sql })),
          indices: indices.map(i => ({ name: i.name, table: i.tbl_name, sql: i.sql })),
          tableCount: tables.length,
          indexCount: indices.length,
          checksum: checksum
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Fehler bei getSchemaInfo:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  /**
   * POST /api/system/update
   * Führt update-linux.sh aus (nur auf Linux-Servern).
   * Gibt sofort eine Antwort zurück – der Server startet danach neu.
   */
  static async triggerUpdate(req, res) {
    if (process.platform !== 'linux') {
      return res.status(400).json({
        success: false,
        message: 'Server-Update ist nur auf Linux-Servern verfügbar.'
      });
    }
    try {
      const { spawn } = require('child_process');
      const path = require('path');
      // Pfad: backend/src/controllers -> ../../../ -> Projektroot
      const scriptPath = path.resolve(__dirname, '../../../update-linux.sh');
      // Detached + stdio ignore: Prozess läuft weiter, auch wenn der Server neu startet
      const child = spawn('bash', [scriptPath], {
        detached: true,
        stdio: 'ignore',
        cwd: path.resolve(__dirname, '../../../')
      });
      child.unref();
      console.log('[Update] update-linux.sh gestartet (PID:', child.pid, ')');
      res.json({
        success: true,
        message: 'Update läuft. Der Server wird in Kürze neu gestartet...'
      });
    } catch (error) {
      console.error('[Update] Fehler:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = SystemController;
