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
   * Führt update-via-api.sh aus (nicht-interaktiv, kein Root nötig für git/npm).
   * systemctl restart benötigt einmalige sudoers-Freigabe auf dem Server.
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
      const fs = require('fs');
      // Dediziertes nicht-interaktives Update-Skript (kein Root/sudo nötig für git/npm)
      const scriptPath = path.resolve(__dirname, '../../../update-via-api.sh');
      // chmod +x sicherstellen
      try { fs.chmodSync(scriptPath, 0o755); } catch (_) {}
      // Detached + stdio ignore: Prozess läuft weiter, auch wenn der Server neu startet
      const child = spawn('bash', [scriptPath], {
        detached: true,
        stdio: 'ignore',
        cwd: path.resolve(__dirname, '../../../')
      });
      child.unref();
      console.log('[Update] update-via-api.sh gestartet (PID:', child.pid, ')');
      res.json({
        success: true,
        message: 'Update läuft. Der Server wird in Kürze neu gestartet...'
      });
    } catch (error) {
      console.error('[Update] Fehler:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/system/update-check
   * Prüft ob neue Commits auf GitHub verfügbar sind (git fetch + log).
   */
  static async checkForUpdates(req, res) {
    if (process.platform !== 'linux') {
      return res.json({ upToDate: true, message: 'Nur auf Linux-Servern verfügbar', commits: [] });
    }
    try {
      const { execSync } = require('child_process');
      const path = require('path');
      const cwd = path.resolve(__dirname, '../../../');

      // Aktuellen Hash
      let currentHash = '';
      try { currentHash = execSync('git rev-parse --short HEAD', { cwd }).toString().trim(); } catch (_) {}

      // Fetch + Remote-Hash
      try { execSync('git fetch origin master --quiet', { cwd, timeout: 15000 }); } catch (_) {}

      let remoteHash = '';
      try { remoteHash = execSync('git rev-parse --short origin/master', { cwd }).toString().trim(); } catch (_) {}

      // Neue Commits auflisten
      let commits = [];
      try {
        const log = execSync('git log HEAD..origin/master --oneline', { cwd }).toString().trim();
        commits = log ? log.split('\n').filter(Boolean) : [];
      } catch (_) {}

      // App-Version
      let version = '';
      try {
        const pkg = require(path.join(cwd, 'backend/package.json'));
        version = pkg.version || '';
      } catch (_) {}

      res.json({
        success: true,
        upToDate: commits.length === 0,
        currentHash,
        remoteHash,
        commits,
        version,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/system/update-log
   * Gibt die letzten Zeilen des Update-Logs zurück.
   */
  static getUpdateLog(req, res) {
    const fs = require('fs');
    const logFile = '/tmp/werkstatt-api-update.log';
    const lines = parseInt(req.query.lines) || 50;
    try {
      if (!fs.existsSync(logFile)) {
        return res.json({ success: true, log: '', exists: false });
      }
      const content = fs.readFileSync(logFile, 'utf8');
      const allLines = content.split('\n');
      const last = allLines.slice(-lines).join('\n');
      res.json({ success: true, log: last, exists: true, lines: allLines.length });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/system/restart
   * Startet nur den Service neu (kein git pull).
   */
  static restartService(req, res) {
    if (process.platform !== 'linux') {
      return res.status(400).json({ success: false, message: 'Nur auf Linux-Servern verfügbar.' });
    }
    try {
      const { spawn } = require('child_process');
      res.json({ success: true, message: 'Server wird neu gestartet...' });
      // Kurz warten damit die Antwort noch rausgeht
      setTimeout(() => {
        const child = spawn('bash', ['-c',
          'sudo systemctl restart werkstatt-terminplaner.service 2>/dev/null || pkill -f "node.*server.js"'
        ], { detached: true, stdio: 'ignore' });
        child.unref();
      }, 500);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = SystemController;
