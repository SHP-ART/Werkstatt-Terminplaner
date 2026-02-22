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
   * Führt Update inline aus (git pull + npm build + restart).
   * Inline-Logik im Controller – unabhängig vom Stand von update-via-api.sh auf dem Server.
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
      const repoDir = path.resolve(__dirname, '../../../');
      const logFile = '/tmp/werkstatt-api-update.log';
      const serviceName = 'werkstatt-terminplaner';

      // Node & npm Pfad aus dem laufenden Prozess ableiten – 100% zuverlässig
      const nodeBin = path.dirname(process.execPath); // z.B. /root/.nvm/versions/node/v20/bin
      const npmPath = path.join(nodeBin, 'npm');

      // Inline-Bash-Skript – läuft immer in der aktuell vom Controller definierten Logik.
      // Dadurch ist es egal, ob update-via-api.sh auf dem Server veraltet ist.
      const bashScript = `
set +e
LOG="${logFile}"
REPO="${repoDir}"
SVC="${serviceName}"
NPM="${npmPath}"
exec >> "$LOG" 2>&1

echo ""
echo "=== INLINE-UPDATE gestartet: $(date) ==="
echo "REPO:  $REPO"
echo "NODE:  ${process.execPath}"
echo "NPM:   $NPM"

cd "$REPO" || { echo "FEHLER: Repo-Verzeichnis nicht gefunden: $REPO"; exit 1; }

# 1. Git Pull
echo "--- git pull ---"
git config --global --add safe.directory "$REPO" 2>/dev/null || true
git pull origin master
echo "Git HEAD: $(git rev-parse --short HEAD 2>/dev/null)"

# 2. Frontend bauen
if [ -f "frontend/package.json" ]; then
  echo "--- npm install (frontend) ---"
  "$NPM" install --prefix frontend
  echo "--- npm run build (vite) ---"
  "$NPM" run build --prefix frontend
  BUILD_CODE=$?
  if [ $BUILD_CODE -eq 0 ]; then
    echo "BUILD OK – dist Dateien: $(find frontend/dist -type f 2>/dev/null | wc -l)"
  else
    echo "BUILD FEHLGESCHLAGEN (Exit $BUILD_CODE)"
  fi
else
  echo "WARNUNG: frontend/package.json nicht gefunden"
fi

# 3. Backend Dependencies
if [ -f "backend/package.json" ]; then
  echo "--- npm install (backend) ---"
  "$NPM" install --prefix backend
fi

# 4. Service-Neustart
echo "--- systemctl restart $SVC ---"
if sudo systemctl restart "$SVC.service" 2>/dev/null; then
  echo "Service neugestartet (sudo systemctl)"
elif systemctl restart "$SVC.service" 2>/dev/null; then
  echo "Service neugestartet (systemctl ohne sudo)"
else
  echo "systemctl fehlgeschlagen – versuche kill+restart"
  pkill -f "node.*server.js" 2>/dev/null || true
  echo "Prozess beendet – Watchdog startet ihn neu"
fi

echo "=== UPDATE ABGESCHLOSSEN: $(date) ==="
`;

      // Inline-Script als detached bash-Prozess starten
      const child = spawn('bash', ['-c', bashScript], {
        detached: true,
        stdio: 'ignore',
        cwd: repoDir
      });
      child.unref();
      console.log('[Update] Inline-Update gestartet (PID:', child.pid, '), Log:', logFile);
      res.json({
        success: true,
        message: 'Update läuft. Log unter /tmp/werkstatt-api-update.log einsehbar. Server startet in Kürze neu...'
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

  /**
   * POST /api/system/build-frontend
   * Baut das Vite-Frontend neu (npm run build).
   * Nutzt process.execPath → npm-Pfad ist immer korrekt, egal welcher User.
   */
  static buildFrontend(req, res) {
    if (process.platform !== 'linux') {
      return res.status(400).json({ success: false, message: 'Nur auf Linux-Servern verfügbar.' });
    }
    const path = require('path');
    const { spawn } = require('child_process');
    const repoDir = path.resolve(__dirname, '../../../');
    const logFile = '/tmp/werkstatt-api-update.log';
    // npm liegt immer im gleichen bin-Verzeichnis wie der laufende node-Prozess
    const npmPath = path.join(path.dirname(process.execPath), 'npm');

    const bashScript = `
set +e
exec >> "${logFile}" 2>&1
echo ""
echo "=== FRONTEND-BUILD gestartet: $(date) ==="
echo "NPM: ${npmPath}"
cd "${repoDir}" || exit 1
echo "--- npm install (frontend) ---"
"${npmPath}" install --prefix frontend
echo "--- npm run build ---"
"${npmPath}" run build --prefix frontend
BUILD_CODE=$?
if [ $BUILD_CODE -eq 0 ]; then
  echo "BUILD OK – dist Dateien: $(find frontend/dist -type f 2>/dev/null | wc -l)"
else
  echo "BUILD FEHLGESCHLAGEN (Exit $BUILD_CODE)"
fi
echo "=== FRONTEND-BUILD ABGESCHLOSSEN: $(date) ==="
`;

    const child = spawn('bash', ['-c', bashScript], {
      detached: true,
      stdio: 'ignore',
      cwd: repoDir
    });
    child.unref();
    res.json({ success: true, message: 'Frontend-Build gestartet. Log unter /tmp/werkstatt-api-update.log' });
  }
}

module.exports = SystemController;
