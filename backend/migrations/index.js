/**
 * Migration Runner
 * Verwaltet Datenbank-Migrationen für das Werkstatt-Terminplaner System
 * 
 * Features:
 * - Transaktions-Sicherheit (automatischer Rollback bei Fehler)
 * - Progress-Tracking mit WebSocket-Broadcasting
 * - Timeout-Handling mit AsyncOperation
 * - Dry-Run-Modus für Test-Migrationen
 * - Structured Logging
 */

const path = require('path');
const fs = require('fs');
const { createMigrationOperation } = require('../src/utils/asyncOperations');
const { broadcastEvent } = require('../src/utils/websocket');

const migrations = [
  require('./001_initial'),
  require('./002_termine_basis'),
  require('./003_ersatzauto'),
  require('./004_mitarbeiter'),
  require('./005_lehrlinge'),
  require('./006_termine_erweitert'),
  require('./007_ki_einstellungen'),
  require('./008_ersatzautos_sperren'),
  require('./009_performance_indizes'),
  require('./010_ki_training_quality'),
  require('./011_ki_external_url'),
  require('./010_wochenarbeitszeit'),  // Version 12 - Wochenarbeitszeit-Felder
  require('./012_berechnete_zeiten'),  // Version 13 - Berechnete Zeiten
  require('./013_create_termine_arbeiten_table'),  // Version 14
  require('./015_create_arbeitszeiten_plan'),  // Version 15
  require('./016_add_arbeitszeit_start_ende'),  // Version 16
  require('./017_create_schicht_templates'),  // Version 17
  require('./018_cleanup_legacy_tables'),  // Version 18
  require('./019_add_pause_tracking_and_verschoben'),  // Version 19
  require('./020_tablet_einstellungen')  // Version 20 - Tablet-Steuerung
];

/**
 * Führt eine einzelne Migration mit Transaktions-Sicherheit aus
 * @param {Object} db - SQLite Datenbank-Verbindung
 * @param {Object} migration - Migration-Objekt
 * @param {Function} progressCallback - Progress-Callback (progress, step)
 * @param {Object} options - Optionen { dryRun: boolean, timeout: number }
 * @returns {Promise<Object>} - Migration-Ergebnis
 */
function runMigration(db, migration, progressCallback = null, options = {}) {
  const { dryRun = false, timeout = 300000 } = options;
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const logPrefix = dryRun ? '[DRY-RUN]' : '';
    
    console.log(`${logPrefix} 🔄 Starte Migration ${migration.version}: ${migration.description}`);
    
    // Log in Datei schreiben
    logMigration('STARTED', migration.version, migration.description);
    
    // Progress-Report helper
    const reportProgress = (progress, step) => {
      if (progressCallback) {
        progressCallback(progress, step);
      }
      broadcastMigrationProgress(migration.version, progress, step);
    };

    // Starte Transaktion
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error(`${logPrefix} ❌ Fehler beim Starten der Transaktion:`, err);
        logMigration('FAILED', migration.version, migration.description, err, Date.now() - startTime);
        return reject(err);
      }
      
      reportProgress(10, 'Transaktion gestartet');
      
      // Führe Migration aus
      migration.up(db)
        .then(() => {
          reportProgress(90, 'Migration abgeschlossen');
          
          const duration = Date.now() - startTime;
          
          if (dryRun) {
            // Dry-Run: Rollback statt Commit
            console.log(`${logPrefix} 🔄 Rollback (Dry-Run-Modus)`);
            db.run('ROLLBACK', (err) => {
              if (err) {
                console.error(`${logPrefix} ❌ Rollback fehlgeschlagen:`, err);
                return reject(err);
              }
              
              console.log(`${logPrefix} ✅ Migration ${migration.version} erfolgreich (Dry-Run, ${duration}ms)`);
              logMigration('DRY_RUN_OK', migration.version, migration.description, null, duration);
              
              resolve({
                version: migration.version,
                description: migration.description,
                duration,
                dryRun: true,
                status: 'success'
              });
            });
          } else {
            // Produktiv: Commit
            db.run('COMMIT', (err) => {
              if (err) {
                console.error(`${logPrefix} ❌ Commit fehlgeschlagen - führe Rollback aus:`, err);
                
                db.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) {
                    console.error(`${logPrefix} ❌ Rollback nach Commit-Fehler fehlgeschlagen:`, rollbackErr);
                  }
                  
                  logMigration('FAILED', migration.version, migration.description, err, duration);
                  reject(err);
                });
                return;
              }
              
              console.log(`${logPrefix} ✅ Migration ${migration.version} erfolgreich: ${migration.description} (${duration}ms)`);
              logMigration('COMPLETED', migration.version, migration.description, null, duration);
              reportProgress(100, 'Erfolgreich abgeschlossen');
              
              resolve({
                version: migration.version,
                description: migration.description,
                duration,
                dryRun: false,
                status: 'success'
              });
            });
          }
        })
        .catch((err) => {
          // Fehler in Migration: Rollback
          console.error(`${logPrefix} ❌ Migration ${migration.version} fehlgeschlagen:`, err);
          
          db.run('ROLLBACK', (rollbackErr) => {
            if (rollbackErr) {
              console.error(`${logPrefix} ❌ Rollback fehlgeschlagen:`, rollbackErr);
            } else {
              console.log(`${logPrefix} 🔄 Rollback erfolgreich`);
            }
            
            const duration = Date.now() - startTime;
            logMigration('ROLLED_BACK', migration.version, migration.description, err, duration);
            reject(err);
          });
        });
    });
  });
}

/**
 * Führt alle ausstehenden Migrationen aus
 * @param {Object} db - SQLite Datenbank-Verbindung
 * @param {number} currentVersion - Aktuelle Schema-Version (0 = neue DB)
 * @param {Object} options - Optionen { dryRun: boolean, timeout: number }
 * @returns {Promise<number>} - Neue Schema-Version
 */
async function runMigrations(db, currentVersion, options = {}) {
  const { dryRun = false, timeout = 300000 } = options;
  
  console.log(`📊 Aktuelle Schema-Version: ${currentVersion}`);
  console.log(`📊 Verfügbare Migrationen: ${migrations.length}`);

  let migrationsRun = 0;
  const results = [];
  const pendingMigrations = migrations.filter(m => m.version > currentVersion);

  if (pendingMigrations.length === 0) {
    console.log('✅ Keine neuen Migrationen erforderlich');
    return currentVersion;
  }

  console.log(`🚀 ${pendingMigrations.length} Migration(en) ausstehend`);

  for (let i = 0; i < pendingMigrations.length; i++) {
    const migration = pendingMigrations[i];
    const migrationNum = i + 1;
    const totalMigrations = pendingMigrations.length;

    try {
      // Progress-Callback für WebSocket-Broadcasting
      const progressCallback = (progress, step) => {
        const overallProgress = ((migrationNum - 1) / totalMigrations * 100) + (progress / totalMigrations);
        broadcastMigrationProgress(migration.version, overallProgress, `[${migrationNum}/${totalMigrations}] ${step}`);
      };

      // Erstelle AsyncOperation für Timeout-Handling
      const operation = createMigrationOperation(
        migration.version,
        migration.description,
        migration.timeout || timeout
      );

      // Führe Migration mit Timeout aus
      const result = await operation.execute(
        async (opProgress) => {
          // Operation-Progress an Migration-Progress weiterleiten
          progressCallback(opProgress.progress || 0, opProgress.currentStep || 'In Bearbeitung...');
          
          // Führe Migration aus
          return await runMigration(db, migration, progressCallback, options);
        },
        async (timeoutError) => {
          // Timeout-Handler: Rollback wurde bereits in runMigration durchgeführt
          console.error(`⏱️ Migration ${migration.version} timeout - Rollback durchgeführt`);
          throw timeoutError;
        }
      );

      results.push(result);
      migrationsRun++;

    } catch (error) {
      console.error(`❌ Migration abgebrochen bei Version ${migration.version}`);
      
      // Broadcast Fehler
      try {
        broadcastEvent('migration_failed', {
          version: migration.version,
          description: migration.description,
          error: error.message,
          migrationsCompleted: migrationsRun,
          migrationsPending: totalMigrations - migrationsRun
        });
      } catch (broadcastErr) {
        console.warn('⚠️ Fehler beim Broadcasen:', broadcastErr.message);
      }
      
      throw error;
    }
  }

  if (dryRun) {
    console.log(`✅ Dry-Run abgeschlossen: ${migrationsRun} Migration(en) getestet (keine Änderungen committed)`);
  } else {
    console.log(`✅ ${migrationsRun} Migration(en) erfolgreich ausgeführt`);
  }

  // Broadcast Erfolg
  try {
    broadcastEvent('migrations_completed', {
      migrationsRun,
      newVersion: migrations.length,
      oldVersion: currentVersion,
      results,
      dryRun
    });
  } catch (broadcastErr) {
    console.warn('⚠️ Fehler beim Broadcasen:', broadcastErr.message);
  }

  return migrations.length;
}

/**
 * Broadcastet Migration-Progress via WebSocket
 */
function broadcastMigrationProgress(version, progress, step) {
  try {
    broadcastEvent('migration_progress', {
      version,
      progress: Math.min(100, Math.max(0, progress)),
      step,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Fail silently
  }
}

/**
 * Schreibt Migration-Log in Datei
 */
function logMigration(status, version, description, error = null, duration = null) {
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'migrations.log');
    const timestamp = new Date().toISOString();
    
    let logLine = `[${timestamp}] [Version ${version}] [${status}]`;
    
    if (duration !== null) {
      logLine += ` [Duration: ${duration}ms]`;
    }
    
    logLine += ` ${description}`;
    
    if (error) {
      logLine += `\n  Error: ${error.message}`;
      if (error.stack) {
        logLine += `\n  Stack: ${error.stack.split('\n').slice(0, 3).join('\n  ')}`;
      }
    }
    
    logLine += '\n';
    
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (logError) {
    console.warn('⚠️ Fehler beim Schreiben des Migration-Logs:', logError.message);
  }
}

/**
 * Gibt die aktuelle Migrations-Version zurück
 * @returns {number}
 */
function getLatestVersion() {
  return migrations.length;
}

/**
 * Prüft ob Migrationen ausstehen
 * @param {number} currentVersion - Aktuelle Schema-Version
 * @returns {boolean}
 */
function hasPendingMigrations(currentVersion) {
  return currentVersion < migrations.length;
}

/**
 * Gibt Liste der ausstehenden Migrationen zurück
 * @param {number} currentVersion - Aktuelle Schema-Version
 * @returns {Array} - Array von Migration-Objekten
 */
function getPendingMigrations(currentVersion) {
  return migrations.filter(m => m.version > currentVersion);
}

/**
 * Gibt alle Migrationen zurück
 * @returns {Array} - Array von Migration-Objekten
 */
function getAllMigrations() {
  return migrations;
}

module.exports = {
  runMigrations,
  getLatestVersion,
  hasPendingMigrations,
  getPendingMigrations,
  getAllMigrations
};
