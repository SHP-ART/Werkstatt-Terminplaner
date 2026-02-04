/**
 * AsyncOperation Utility
 * 
 * Verwaltet lange laufende asynchrone Operationen mit:
 * - Konfigurierbaren Timeouts
 * - Progress-Tracking
 * - WebSocket-Broadcasting
 * - Automatischem Rollback bei Timeout
 */

const { broadcastEvent } = require('./broadcast');

/**
 * Async Operation mit Timeout und Progress-Tracking
 */
class AsyncOperation {
  /**
   * @param {string} name - Name der Operation
   * @param {number} timeoutMs - Timeout in Millisekunden (Standard: 5 Minuten)
   * @param {Object} options - Zusätzliche Optionen
   */
  constructor(name, timeoutMs = 300000, options = {}) {
    this.name = name;
    this.timeoutMs = timeoutMs;
    this.startTime = Date.now();
    this.progress = 0;
    this.status = 'pending';
    this.currentStep = '';
    this.options = options;
    this.timeoutId = null;
    this.warningThreshold = options.warningThreshold || 0.8; // 80% als Standard
  }

  /**
   * Führt die Operation mit Timeout aus
   * @param {Function} fn - Async-Funktion mit progressCallback als Parameter
   * @param {Function} onTimeout - Optional: Callback bei Timeout (z.B. Rollback)
   * @returns {Promise<any>} Ergebnis der Operation
   */
  async execute(fn, onTimeout = null) {
    this.status = 'running';
    this.broadcastStatus();

    const warningTimeoutMs = this.timeoutMs * this.warningThreshold;
    let warningTimeoutId = null;
    let hasWarned = false;

    // Timeout-Promise
    const timeoutPromise = new Promise((_, reject) => {
      // Warning bei 80% Timeout
      warningTimeoutId = setTimeout(() => {
        if (!hasWarned) {
          hasWarned = true;
          const remainingMs = this.timeoutMs - warningTimeoutMs;
          const remainingSec = Math.ceil(remainingMs / 1000);
          
          console.warn(`⚠️ Operation '${this.name}' nähert sich Timeout (noch ${remainingSec}s)`);
          
          this.broadcastEvent('operation_timeout_warning', {
            name: this.name,
            remainingSeconds: remainingSec,
            progress: this.progress
          });
        }
      }, warningTimeoutMs);

      // Finaler Timeout
      this.timeoutId = setTimeout(() => {
        const error = new Error(`Operation '${this.name}' timeout nach ${this.timeoutMs}ms`);
        error.code = 'OPERATION_TIMEOUT';
        error.operationName = this.name;
        error.progress = this.progress;
        reject(error);
      }, this.timeoutMs);
    });

    // Progress-Callback für die Operation
    const progressCallback = (progress, step = '') => {
      this.progress = Math.min(100, Math.max(0, progress));
      this.currentStep = step;
      this.broadcastStatus();
    };

    try {
      // Führe Operation aus
      const operationPromise = fn(progressCallback);
      
      // Race zwischen Operation und Timeout
      const result = await Promise.race([operationPromise, timeoutPromise]);
      
      // Erfolg
      clearTimeout(this.timeoutId);
      clearTimeout(warningTimeoutId);
      this.status = 'completed';
      this.progress = 100;
      this.broadcastStatus();
      
      return result;

    } catch (error) {
      // Cleanup Timeouts
      clearTimeout(this.timeoutId);
      clearTimeout(warningTimeoutId);

      // Prüfe ob Timeout-Fehler
      if (error.code === 'OPERATION_TIMEOUT') {
        this.status = 'timeout';
        
        console.error(`❌ Operation '${this.name}' timeout:`, error.message);
        
        // Führe optionalen Timeout-Handler aus (z.B. Rollback)
        if (onTimeout && typeof onTimeout === 'function') {
          try {
            console.log(`🔄 Führe Timeout-Handler für '${this.name}' aus...`);
            await onTimeout(error);
          } catch (rollbackError) {
            console.error(`❌ Timeout-Handler fehlgeschlagen:`, rollbackError);
          }
        }
      } else {
        this.status = 'failed';
        console.error(`❌ Operation '${this.name}' fehlgeschlagen:`, error.message);
      }

      this.broadcastStatus();
      throw error;
    }
  }

  /**
   * Broadcastet aktuellen Status via WebSocket
   */
  broadcastStatus() {
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(0, this.timeoutMs - elapsed);
    
    this.broadcastEvent('operation_progress', {
      name: this.name,
      status: this.status,
      progress: this.progress,
      currentStep: this.currentStep,
      elapsedMs: elapsed,
      remainingMs: remaining,
      remainingSeconds: Math.ceil(remaining / 1000),
      timeoutMs: this.timeoutMs
    });
  }

  /**
   * Broadcastet Event via WebSocket (wrapped für besseres Error-Handling)
   */
  broadcastEvent(event, data) {
    try {
      broadcastEvent(event, data);
    } catch (error) {
      // Fail silently - WebSocket-Fehler sollen Operation nicht blockieren
      console.warn(`⚠️ Broadcast-Fehler für Event '${event}':`, error.message);
    }
  }

  /**
   * Gibt verbleibende Zeit in Sekunden zurück
   */
  getRemainingSeconds() {
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(0, this.timeoutMs - elapsed);
    return Math.ceil(remaining / 1000);
  }

  /**
   * Prüft ob Operation dem Timeout nahe ist (>= warningThreshold)
   */
  isNearTimeout() {
    const elapsed = Date.now() - this.startTime;
    return elapsed >= (this.timeoutMs * this.warningThreshold);
  }
}

/**
 * Factory-Funktion für gängige Operations-Typen
 */
function createMigrationOperation(version, description, timeoutMs = 300000) {
  return new AsyncOperation(
    `Migration ${version}: ${description}`,
    timeoutMs,
    { type: 'migration', version }
  );
}

function createBackupOperation(timeoutMs = 60000) {
  return new AsyncOperation(
    'Database Backup',
    timeoutMs,
    { type: 'backup' }
  );
}

function createRestoreOperation(timeoutMs = 120000) {
  return new AsyncOperation(
    'Database Restore',
    timeoutMs,
    { type: 'restore' }
  );
}

module.exports = {
  AsyncOperation,
  createMigrationOperation,
  createBackupOperation,
  createRestoreOperation
};
